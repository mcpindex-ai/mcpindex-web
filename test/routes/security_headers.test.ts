// Guards the next.config.ts header rules — specifically which paths are exempt from
// `frame-ancestors 'none'` / `X-Frame-Options: DENY`.
//
// THE BUG THIS EXISTS FOR: the site-wide exclusion was written as
// `/((?!embed\.html$).*)` when the static /embed.html was the only embed surface.
// app/embed/[slug] arrived later — one player page per film, and the `embedUrl`
// named by every VideoObject — but the exclusion was never widened, so the pages
// whose entire job is to be embedded were served frame-ancestors 'none' and no
// third party (or Google video indexing) could frame them. Verified against a
// real cross-origin iframe before and after the fix.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../../next.config';

type HeaderRule = { source: string; headers: Array<{ key: string; value: string }> };

async function rules(): Promise<HeaderRule[]> {
  assert.ok(typeof nextConfig.headers === 'function', 'next.config must define headers()');
  return (await nextConfig.headers!()) as unknown as HeaderRule[];
}

const keys = (r: HeaderRule) => r.headers.map((h) => h.key.toLowerCase());
const valueOf = (r: HeaderRule, key: string) =>
  r.headers.find((h) => h.key.toLowerCase() === key)!.value;

/** The site-wide rule is the one carrying X-Frame-Options: DENY. */
async function siteWide(): Promise<HeaderRule> {
  const hit = (await rules()).find((r) => keys(r).includes('x-frame-options'));
  assert.ok(hit, 'expected a site-wide rule setting X-Frame-Options');
  return hit;
}

/**
 * Re-implements the `/((?!…).*)`-style match. Next compiles `source` with
 * path-to-regexp, but the ONLY thing under test is the negative-lookahead
 * exclusion, which is plain regex and behaves identically anchored end-to-end.
 */
function matches(source: string, path: string): boolean {
  return new RegExp(`^${source}$`).test(path);
}

test('the site-wide frame ban does NOT cover /embed/<slug>', () => {
  // The regression: this returned true, so every embed page inherited DENY.
  return siteWide().then((r) => {
    assert.equal(matches(r.source, '/embed/mcp-tool-contract-drift'), false);
    assert.equal(matches(r.source, '/embed/install-the-mcpindex-gate'), false);
  });
});

test('the site-wide frame ban does NOT cover the static /embed.html', async () => {
  assert.equal(matches((await siteWide()).source, '/embed.html'), false);
});

test('the site-wide frame ban still covers ordinary pages', async () => {
  const r = await siteWide();
  for (const p of ['/', '/install', '/search', '/server/some-slug', '/docs']) {
    assert.equal(matches(r.source, p), true, `${p} must keep X-Frame-Options: DENY`);
  }
});

test('the exemption is not over-broad: /embedded-* keeps the frame ban', async () => {
  // `embed/` needs its trailing slash. Without it this rule would also exempt
  // any future /embedded-… page, silently making it frameable.
  const r = await siteWide();
  assert.equal(matches(r.source, '/embedded-decoy'), true);
  assert.equal(matches(r.source, '/embeddings'), true);
});

test('an /embed/ rule exists and omits BOTH framing controls', async () => {
  const embed = (await rules()).find((r) => r.source.startsWith('/embed/'));
  assert.ok(embed, 'expected a header rule scoped to /embed/');
  assert.ok(
    !keys(embed).includes('x-frame-options'),
    'X-Frame-Options cannot be unset once sent — the embed rule must never set it',
  );
  assert.doesNotMatch(
    valueOf(embed, 'content-security-policy'),
    /frame-ancestors/,
    'the embed CSP must not carry frame-ancestors',
  );
});

test('the embed exemption gives up framing controls ONLY', async () => {
  // A frameable page is still a hardened page: dropping nosniff/referrer/permissions
  // alongside frame-ancestors would trade one bug for a weaker surface.
  const embed = (await rules()).find((r) => r.source.startsWith('/embed/'))!;
  for (const k of ['content-security-policy', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) {
    assert.ok(keys(embed).includes(k), `embed rule must still set ${k}`);
  }
  const csp = valueOf(embed, 'content-security-policy');
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'"]) {
    assert.ok(csp.includes(d), `embed CSP must still carry ${d}`);
  }
});
