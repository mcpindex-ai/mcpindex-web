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
  '/servers/page/2', NOT_FOUND_PROBE,
];

// Dynamic templates: resolved to a real slug at runtime so the audit covers
// /server/<slug>, /guides/<slug> and /best/<category> rather than skipping them.
const DYNAMIC_SOURCES = [
  { index: '/servers', pattern: /\/server\/[a-z0-9._@/-]+/i },
  { index: '/guides', pattern: /\/guides\/[a-z0-9-]+/i },
  { index: '/best', pattern: /\/best\/[a-z0-9-]+/i },
];

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
    // contrast obligation. Partially transparent text does — composite it.
    const opacity = effectiveOpacity(el);
    if (opacity === 0) continue;

    const rawFg = parseColor(cs.color);
    if (!rawFg || rawFg[3] === 0) continue;
    const bg = backgroundOf(el);
    const fg = flatten([rawFg[0], rawFg[1], rawFg[2], rawFg[3] * opacity], bg);

    const px = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    // WCAG "large text": >=24px, or >=18.66px when bold.
    const large = px >= 24 || (bold && px >= 18.66);
    const required = large ? 3 : 4.5;
    const measured = ratio(fg, bg);

    // 0.005 absorbs float noise around the threshold (4.495 is not a real fail).
    if (measured + 0.005 < required) {
      violations.push({
        selector: selectorFor(el),
        text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60),
        fg: `rgb(${fg.slice(0, 3).map(Math.round).join(',')})`,
        bg: `rgb(${bg.slice(0, 3).join(',')})`,
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

// Discover one live slug per dynamic template from its index page.
const discovered = [];
for (const { index, pattern } of DYNAMIC_SOURCES) {
  try {
    const res = await page.goto(`${BASE}${index}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (!res || !res.ok()) continue;
    const match = (await page.content()).match(pattern);
    if (match) discovered.push(match[0]);
  } catch {
    // An unreachable index just means no dynamic sample for this template.
  }
}
if (discovered.length) console.log(`dynamic samples: ${discovered.join(', ')}\n`);

let failed = 0;
let unparsedColors = 0;
for (const route of [...ROUTES, ...discovered]) {
  const url = `${BASE}${route}`;
  try {
    // Not `networkidle`: pages with a live ticker keep polling and never idle.
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    // NOT_FOUND_PROBE is expected to 404 — that response IS the page under test.
    const expected404 = route === NOT_FOUND_PROBE && res && res.status() === 404;
    if (!res || (!res.ok() && !expected404)) {
      console.log(`SKIP ${route} (HTTP ${res ? res.status() : 'no response'})`);
      continue;
    }
    await page.waitForTimeout(1_500); // let client components paint
  } catch (err) {
    console.log(`SKIP ${route} (${err.message.split('\n')[0]})`);
    continue;
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
    console.log(`WARN ${route} — unparsed color(s), NOT audited: ${unparsed.join(', ')}`);
  }
  if (violations.length === 0) {
    console.log(`PASS ${route}`);
    continue;
  }
  failed += violations.length;
  console.log(`FAIL ${route} — ${violations.length} violation(s)`);
  for (const v of violations) {
    console.log(
      `      ${v.ratio}:1 (needs ${v.required}) ${v.fg} on ${v.bg} ` +
        `${v.px}px${v.bold ? ' bold' : ''}\n` +
        `        ${v.selector}\n        "${v.text}"`,
    );
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
console.log('\ncontrast: all audited routes meet WCAG AA (resting state).');
