// robots.txt is a crawler-facing contract with no build-time type safety and no runtime
// consumer inside the app, so nothing else in the suite would notice it regressing. It
// regressed once already: with no Disallow at all, Googlebot followed the /docs and
// /ledger links into /api/v1/*, GET'd POST-only handlers, and Search Console filed the
// 405s/400s as "Blocked due to other 4xx issue" — indexing errors against URLs that were
// never pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import robots from '../../app/robots';

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };

const list = (v: string | string[] | undefined): string[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * Resolve a path against one rule group the way RFC 9309 §2.2.2 says: the longest matching
 * pattern wins, and Allow wins a tie. Asserting the raw arrays instead would pass even if
 * the badge Allow were shorter than the /api/ Disallow and therefore lost — the precedence
 * IS the fix, so the test has to exercise it.
 */
function allows(rule: Rule, path: string): boolean {
  const longest = (pats: string[]) =>
    pats.filter((p) => path.startsWith(p)).reduce((best, p) => Math.max(best, p.length), -1);
  return longest(list(rule.allow)) >= longest(list(rule.disallow));
}

const groups = () => robots().rules as Rule[];

test('robots: every user-agent group blocks the JSON API', () => {
  // A user-agent group inherits nothing from the `*` group, so a per-bot rule that forgot
  // the Disallow would leave that bot crawling the API even though `*` is covered.
  for (const rule of groups()) {
    assert.equal(
      allows(rule, '/api/v1/screen'),
      false,
      `${rule.userAgent} may crawl /api/v1/screen (a POST-only handler that answers 405)`,
    );
  }
});

test('robots: the badge endpoint stays crawlable so its noindex can be seen', () => {
  // The instinct is to fold this into the /api/ block, since badge URLs dominate the error
  // buckets. That reasoning is backwards and was acted on once already. vercel.json sends
  // X-Robots-Tag: noindex on /api/(.*) as of 2026-07-28, and the 08-08 export shows a clean
  // split on that date: every badge URL crawled 07-28 or later is in "Excluded by noindex"
  // (53), every one still in "Soft 404"/"Crawled - not indexed" (45) was last crawled on or
  // before it. Blocking the badge stops the recrawl that migrates those 45, freezing them in
  // error buckets forever, and invites "Indexed, though blocked by robots.txt" on a URL
  // third-party READMEs link by design. noindex needs a crawl to be read; Disallow prevents
  // exactly that crawl. The two are not interchangeable.
  for (const rule of groups()) {
    assert.equal(
      allows(rule, '/api/v1/badge/io-github-example-server'),
      true,
      `${rule.userAgent} cannot reach the badge, so it can never see the noindex header`,
    );
  }
});

test('robots: the page surface is still fully open', () => {
  // The site is deliberately open to every crawler including agent bots. Narrowing the API
  // must not narrow anything a reader can actually land on.
  for (const rule of groups()) {
    for (const path of ['/', '/server/io-github-example-server', '/guides/how-to-trust-an-mcp-server', '/install']) {
      assert.equal(allows(rule, path), true, `${rule.userAgent} is blocked from ${path}`);
    }
  }
});

test('robots: still advertises the sitemap and canonical host', () => {
  const r = robots();
  assert.equal(r.sitemap, 'https://mcpindex.ai/sitemap.xml');
  assert.equal(r.host, 'https://mcpindex.ai');
});
