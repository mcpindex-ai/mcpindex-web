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

test('robots: the badge endpoint is blocked too — it is not an exception', () => {
  // The obvious instinct is to exempt this one, because READMEs embed it as an <img>. The
  // 2026-08-08 Search Console export says otherwise: /api/v1/badge/* produced ALL 26 "Soft
  // 404" URLs and 53 of the 66 "Excluded by noindex". Exempting it re-opens ~20k crawlable
  // image URLs on a property that already has 11,687 pages stuck in "Discovered - currently
  // not indexed". Browsers and GitHub's camo proxy ignore robots.txt, so nothing that
  // renders a badge breaks. This test exists to stop that instinct being acted on again.
  for (const rule of groups()) {
    assert.equal(
      allows(rule, '/api/v1/badge/io-github-example-server'),
      false,
      `${rule.userAgent} may crawl the badge endpoint (26 soft-404s came from this route)`,
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
