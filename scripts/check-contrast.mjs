#!/usr/bin/env node
/**
 * WCAG 2.2 AA text-contrast audit over the real rendered pages.
 *
 * Why a runtime audit and not a lint rule: contrast is a property of the
 * *pair* (computed color, effective background), and our accent token is
 * legible on paper but not on ink. Only the browser knows which pair a given
 * element actually resolves to, so static grepping for accent text utilities
 * both misses failures and invents them.
 *
 * (Deliberately no Tailwind-shaped class strings in these comments: the v4
 * scanner reads this file and would emit a CSS rule for anything that looks
 * like a utility, which then fails to parse.)
 *
 * Usage: node scripts/check-contrast.mjs [baseUrl]
 * Exits 1 on any violation so CI can gate on it.
 */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? process.env.CONTRAST_BASE_URL ?? 'http://localhost:3000';

// Deliberately unrouteable, so the 404 page itself gets audited.
const NOT_FOUND_PROBE = '/this-route-does-not-exist';

// Static pages, plus one concrete instance of each dynamic template — the
// templates carry most of the site's markup, so auditing only static routes
// leaves the majority of rendered pages unchecked.
const ROUTES = [
  '/', '/docs', '/install', '/methodology', '/whitepaper', '/ledger',
  '/screen', '/scan', '/demo', '/leaderboard', '/stats', '/status',
  '/guides', '/best', '/search', '/about', '/trust', '/accessibility',
  '/changelog', '/brand', '/which-mcpindex', '/drift-report', '/servers',
  '/claim', '/dashboard', '/privacy', '/terms', '/research/source-liveness',
  '/servers/page/2', '/receipts', NOT_FOUND_PROBE,
];

// Dynamic templates: resolved to a real slug at runtime so the audit covers
// /server/<slug>, /guides/<slug> and /best/<category> rather than skipping them.
const DYNAMIC_SOURCES = [
  { index: '/servers', pattern: /\/server\/[a-z0-9._@/-]+/i },
  { index: '/guides', pattern: /\/guides\/[a-z0-9-]+/i },
  { index: '/best', pattern: /\/best\/[a-z0-9-]+/i },
];

// Anything whose contrast can change on hover: native interactive elements, ARIA
// widgets, focusable nodes, and — the reason this exists — anything carrying a
// Tailwind hover: utility (which also matches group-hover:, so a child recolored
// by an ancestor's hover is covered too).
const HOVER_SELECTOR =
  'a, button, summary, label, [role="button"], [role="link"], [tabindex], [class*="hover:"]';

// Hover doubles the wall-clock (a second measurement pass per route). On by
// default so local and CI enforce the same thing; opt out for fast iteration.
const SKIP_HOVER = process.env.CONTRAST_SKIP_HOVER === '1';

// Identity of a violation independent of the state it was found in, so a failure
// present at REST and under hover is reported once (at rest), not twice.
const keyOf = (v) => `${v.selector}|${v.text}|${v.px}`;

const printViolation = (v, tag = '') => {
  console.log(
    `      ${v.ratio}:1 (needs ${v.required}) ${v.fg} on ${v.bg} ` +
      `${v.px}px${v.bold ? ' bold' : ''}${tag}\n` +
      `        ${v.selector}\n        "${v.text}"`,
  );
};

// Runs in the page. Walks every element owning a non-empty text node, resolves
// the nearest opaque ancestor background, and applies the AA threshold.
function auditPage() {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const luminance = ([r, g, b]) =>
    0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

  // Chromium serializes computed colors in whatever space the author used, so
  // Tailwind v4 hands back lab() / oklab() / oklch() / color(srgb …) as well as
  // rgb(). Rather than chase each syntax with a regex, paint the color onto a
  // 1x1 canvas and read the sRGB bytes back — that covers every CSS color the
  // browser itself understands. rgb()/rgba() keeps a fast path since it is the
  // overwhelming majority and this runs per element.
  // Anything still unparsed is REPORTED, never silently skipped: a skipped
  // element is an unaudited element, which is what this script exists to catch.
  const unparsed = new Set();
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

  const parseColor = (s) => {
    if (!s) return null;
    const rgb = s.match(/^rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:[,/]\s*([\d.]+))?\)$/);
    if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4]];
    if (s === 'transparent') return [0, 0, 0, 0];

    // Assign against two different defaults; if the browser rejects the color,
    // fillStyle keeps each default and the two readbacks disagree.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = s;
    const asBlack = ctx.fillStyle;
    ctx.fillStyle = '#ffffff';
    ctx.fillStyle = s;
    if (asBlack !== ctx.fillStyle) {
      unparsed.add(s);
      return null;
    }

    ctx.globalCompositeOperation = 'copy';
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };

  // CSS `opacity` is inherited multiplicatively down the tree and is invisible
  // to the color's own alpha channel, so fold the ancestor chain in.
  const effectiveOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      o *= Number(getComputedStyle(n).opacity);
      if (o === 0) return 0;
    }
    return o;
  };

  // Composite a translucent foreground over its backdrop; a 60%-opacity ink
  // caption is a real contrast risk and must not be scored as if it were solid.
  const flatten = (fg, bg) =>
    fg[3] >= 1 ? fg : [0, 1, 2].map((i) => fg[3] * fg[i] + (1 - fg[3]) * bg[i]);

  const firstOpaque = (nodes) => {
    for (const n of nodes) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.95) return c;
    }
    return null;
  };

  // The DOM ancestor chain is the right backdrop for normal flow, but it LIES
  // for out-of-flow elements: a `position:absolute` copy button painted over a
  // dark <pre> has only transparent ancestors, so the chain reports white and
  // manufactures a violation for text that is actually fine. For those, ask the
  // renderer what is really painted underneath. Restricted to out-of-flow
  // elements because elementsFromPoint needs the element scrolled into view.
  // What is geometrically underneath an out-of-flow element: the deepest
  // element inside its positioning context whose box contains this one's
  // centre. Models "absolute button painted over its sibling <pre>", and unlike
  // hit-testing it needs no scrolling and cannot be defeated by pointer-events.
  const coveringSibling = (el) => {
    const host = el.offsetParent ?? el.parentElement;
    if (!host) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let found = null;
    for (const cand of host.querySelectorAll('*')) {
      if (cand === el || cand.contains(el)) continue;
      const cr = cand.getBoundingClientRect();
      if (cr.width === 0 || cr.height === 0) continue;
      if (cx < cr.left || cx > cr.right || cy < cr.top || cy > cr.bottom) continue;
      const c = parseColor(getComputedStyle(cand).backgroundColor);
      if (c && c[3] > 0.95) found = c; // later in DOM order paints on top
    }
    return found;
  };

  const backgroundOf = (el) => {
    const position = getComputedStyle(el).position;
    if (position === 'absolute' || position === 'fixed' || position === 'sticky') {
      const r = el.getBoundingClientRect();
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const self = stack.indexOf(el);
      // Only trust the hit-test when it actually found this element; otherwise
      // the element is clipped, covered, or off-screen and the stack describes
      // something else entirely.
      const painted = self >= 0 ? firstOpaque(stack.slice(self + 1)) : coveringSibling(el);
      if (painted) return painted;
    }
    return firstOpaque([...ancestorsOf(el)]) ?? [255, 255, 255, 1];
  };

  function* ancestorsOf(el) {
    for (let n = el; n; n = n.parentElement) yield n;
  }

  // A group opacity (< 1) on el or an ancestor composites the WHOLE subtree —
  // text and its background together — over whatever is behind the OUTERMOST
  // such ancestor. That backdrop, not the element's own background, is what the
  // dimmed pixels blend toward. (This is what `hover:opacity-90` on a solid CTA
  // does: it fades the button over the page, lightening the bg under the text.)
  const backdropBehindOpacityGroup = (el) => {
    let outer = null;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (Number(getComputedStyle(n).opacity) < 1) outer = n;
    }
    const above = outer ? outer.parentElement : el.parentElement;
    return firstOpaque([...ancestorsOf(above)]) ?? [255, 255, 255, 1];
  };

  const ratio = (a, b) => {
    const la = luminance(a);
    const lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  };

  const selectorFor = (el) => {
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean);
    return el.tagName.toLowerCase() + (cls.length ? `.${cls.slice(0, 4).join('.')}` : '');
  };

  // Text inside a replaced element is FALLBACK content — a browser that can
  // render the element never paints it, so it carries no contrast obligation.
  const REPLACED = new Set(['VIDEO', 'AUDIO', 'CANVAS', 'OBJECT', 'IFRAME', 'IMG', 'SVG']);

  const violations = [];
  for (const el of document.querySelectorAll('*')) {
    if (REPLACED.has(el.tagName)) continue;
    const ownsText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0,
    );
    if (!ownsText) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;

    // WCAG 1.4.3 exempts text in an inactive UI component. Native :disabled
    // only — `aria-disabled` controls stay focusable, so they stay audited.
    if (el.closest(':disabled')) continue;

    // Fully transparent text is invisible to everyone, so it carries no
    // contrast obligation.
    const opacity = effectiveOpacity(el);
    if (opacity === 0) continue;

    const rawFg = parseColor(cs.color);
    if (!rawFg || rawFg[3] === 0) continue;
    const bg = backgroundOf(el);

    // Text over its own opaque background, honoring the text color's own alpha.
    const textOverBg = flatten(rawFg, bg);
    let fg = textOverBg;
    let bgEff = bg;
    if (opacity < 1) {
      // Group opacity dims text AND bg toward the same backdrop — not the text
      // toward the bg. Model both, or a faded solid CTA scores wrong.
      const backdrop = backdropBehindOpacityGroup(el);
      fg = [0, 1, 2].map((i) => opacity * textOverBg[i] + (1 - opacity) * backdrop[i]);
      bgEff = [0, 1, 2].map((i) => opacity * bg[i] + (1 - opacity) * backdrop[i]);
    }

    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    // WCAG "large text": >=24px, or >=18.66px when bold.
    const large = px >= 24 || (bold && px >= 18.66);
    const required = large ? 3 : 4.5;
    const measured = ratio(fg, bgEff);

    // 0.005 absorbs float noise around the threshold (4.495 is not a real fail).
    if (measured + 0.005 < required) {
      violations.push({
        selector: selectorFor(el),
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60),
        fg: `rgb(${fg.slice(0, 3).map(Math.round).join(',')})`,
        bg: `rgb(${bgEff.slice(0, 3).map(Math.round).join(',')})`,
        px,
        bold,
        ratio: Number(measured.toFixed(2)),
        required,
      });
    }
  }
  return { violations, unparsed: [...unparsed] };
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  // Scroll-driven `.reveal` sections sit at opacity:0 until scrolled into view,
  // which would silently exclude every below-the-fold section from the audit.
  // Reduced-motion is the site's own no-animation path, so content renders at
  // its final opacity — the state we actually need to measure.
  reducedMotion: 'reduce',
});

// One CDP session, reused across routes, to force :hover without a real cursor —
// so every hover-styled element is measured in one pass instead of hovering each.
const cdp = SKIP_HOVER ? null : await page.context().newCDPSession(page);
if (cdp) {
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
}

// Force :hover on every hover-capable element, then re-audit. Transitions are
// killed first so getComputedStyle reads the settled hovered color, not a frame
// mid-animation. Forced state and the injected <style> live only on the current
// document, so navigation to the next route resets both — no teardown needed.
async function auditHover(restingViolations) {
  await page.addStyleTag({
    content: '*,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}',
  });
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: HOVER_SELECTOR,
  });
  for (const nodeId of nodeIds) {
    // A node can go stale between query and force (async client component); skip it.
    try {
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] });
    } catch {
      /* stale node */
    }
  }
  const restingKeys = new Set(restingViolations.map(keyOf));
  const { violations } = await page.evaluate(auditPage);
  // Only failures INTRODUCED by hover; ones that also fail at rest are counted there.
  return violations.filter((v) => !restingKeys.has(keyOf(v)));
}

// Discover one live slug per dynamic template from its index page. A template that yields NO
// slug is a silent coverage hole (its /server, /guides, or /best page never gets audited), so
// track it and fail closed at the end - the same posture as unparsedColors. These indexes are
// SSG from committed data, so a real miss means a markup/data break worth catching, not a
// transient absence.
const discovered = [];
const uncoveredTemplates = [];
for (const { index, pattern } of DYNAMIC_SOURCES) {
  let found = null;
  try {
    const res = await page.goto(`${BASE}${index}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (res && res.ok()) {
      const match = (await page.content()).match(pattern);
      if (match) found = match[0];
    }
  } catch {
    // fall through to uncovered
  }
  if (found) {
    discovered.push(found);
  } else {
    uncoveredTemplates.push(index);
    console.log(`WARN ${index} — no dynamic slug discovered; its template is UNAUDITED`);
  }
}
if (discovered.length) console.log(`dynamic samples: ${discovered.join(', ')}\n`);

// Audit every route at both widths: responsive type can cross the large-text
// threshold (3:1 vs 4.5:1) between them, and below `md` the nav collapses into a
// disclosure whose contents only a mobile-width pass can reach.
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

let failed = 0;
let unparsedColors = 0;
let errored = 0; // pages that could not be audited due to a real error (5xx / timeout / nav failure)
for (const route of [...ROUTES, ...discovered]) {
  for (const view of VIEWPORTS) {
    const label = `${route} [${view.name}]`;
    await page.setViewportSize({ width: view.width, height: view.height });
    const url = `${BASE}${route}`;
    try {
      // Not `networkidle`: pages with a live ticker keep polling and never idle.
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      // NOT_FOUND_PROBE is expected to 404 — that response IS the page under test.
      const expected404 = route === NOT_FOUND_PROBE && res && res.status() === 404;
      // A plain 404 (non-probe) means the route is not available in THIS environment (e.g. a
      // data-backed page like /ledger without its runtime env) — skip it visibly, do not audit,
      // do not fail. But a 5xx / no-response is a BROKEN page: audit it we cannot, so fail the run
      // rather than silently pass — otherwise a page that errors during the audit reports green.
      if (res && res.status() === 404 && !expected404) {
        console.log(`SKIP ${label} (HTTP 404 — not available in this environment)`);
        continue;
      }
      if (!res || (!res.ok() && !expected404)) {
        errored += 1;
        console.log(`ERROR ${label} (HTTP ${res ? res.status() : 'no response'} — cannot audit)`);
        continue;
      }
      await page.waitForTimeout(1_500); // let client components paint
    } catch (err) {
      // A navigation timeout / crash is a real failure, not a skip: a hung or erroring page must
      // not pass the audit by default.
      errored += 1;
      console.log(`ERROR ${label} (${err.message.split('\n')[0]})`);
      continue;
    }

    // Below `md` the nav is a closed disclosure; open it so its links + CTA are
    // rendered and audited. Absent (or already open) on some pages — tolerate both.
    if (view.name === 'mobile') {
      try {
        const toggle = page.locator('button[aria-label="Open menu"]').first();
        if ((await toggle.count()) > 0) {
          await toggle.click({ timeout: 2_000 });
          await page.waitForTimeout(150);
        }
      } catch {
        /* no mobile nav on this page, or not clickable — nothing to open */
      }
    }

    // Walk the page so any viewport-triggered content mounts before auditing.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });

    const { violations, unparsed } = await page.evaluate(auditPage);
    if (unparsed.length) {
      unparsedColors += unparsed.length;
      console.log(`WARN ${label} — unparsed color(s), NOT audited: ${unparsed.join(', ')}`);
    }

    // Hover pass runs regardless of the resting result — a page can be clean at
    // rest and fail only on hover, which is the exact gap this closes.
    let hoverViolations = [];
    if (cdp) {
      try {
        hoverViolations = await auditHover(violations);
      } catch (err) {
        errored += 1;
        console.log(`ERROR ${label} (hover pass: ${err.message.split('\n')[0]})`);
      }
    }

    if (violations.length === 0 && hoverViolations.length === 0) {
      console.log(`PASS ${label}`);
      continue;
    }
    failed += violations.length + hoverViolations.length;
    console.log(
      `FAIL ${label} — ${violations.length} resting` +
        (cdp ? ` + ${hoverViolations.length} hover` : '') +
        ` violation(s)`,
    );
    for (const v of violations) printViolation(v);
    for (const v of hoverViolations) printViolation(v, ' [hover]');
  }
}

await browser.close();

if (unparsedColors > 0) {
  // An unparsed color means an element was skipped, i.e. a silent coverage
  // hole. Fail rather than report a green run over an incomplete audit.
  console.error(`\ncontrast: ${unparsedColors} unparsed color format(s) — audit is incomplete.`);
  process.exit(1);
}
if (failed > 0) {
  console.error(`\ncontrast: ${failed} violation(s) below WCAG AA.`);
  process.exit(1);
}
if (errored > 0) {
  // A page that could not be audited (5xx/timeout/crash) must not be reported as a pass:
  // silence over a broken page looks identical to "clean."
  console.error(`\ncontrast: ${errored} route(s) could not be audited (server error / timeout).`);
  process.exit(1);
}
if (uncoveredTemplates.length > 0) {
  // A dynamic template with no discoverable slug was never audited - fail rather than report a
  // green run over incomplete coverage.
  console.error(`\ncontrast: ${uncoveredTemplates.length} dynamic template(s) had no slug to audit: ${uncoveredTemplates.join(', ')}.`);
  process.exit(1);
}
console.log(
  `\ncontrast: all audited routes meet WCAG AA (${cdp ? 'resting + hover' : 'resting'} state).`,
);
