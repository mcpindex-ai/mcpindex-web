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
 * Compile one robots pattern per RFC 9309 §2.2.3: `*` matches any run of characters, a
 * trailing `$` anchors the end of the path, and everything else is a literal prefix.
 *
 * A plain `path.startsWith(pattern)` would be a silently-wrong shortcut now that the rules
 * use `$` — `/api/v1/drift$` would "match" `/api/v1/drift/any` under startsWith and the
 * test would assert the opposite of what Google does. Since the whole point of this file is
 * to be the only check on a rule set nothing else type-checks, a matcher that fails quietly
 * is worse than none.
 */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const rx = body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${rx}${anchored ? '$' : ''}`).test(path);
}

/**
 * Resolve a path against one rule group per RFC 9309 §2.2.2: the longest matching pattern
 * wins, and Allow takes an equal-length tie. Asserting the raw arrays instead would pass
 * even if a rule's precedence were inverted — the precedence is the fix, so the test has to
 * exercise it. An empty pattern list scores -1 so "no rule matched" resolves to allowed.
 */
function allows(rule: Rule, path: string): boolean {
  const longest = (pats: string[]) =>
    pats.filter((p) => matches(p, path)).reduce((best, p) => Math.max(best, p.length), -1);
  return longest(list(rule.allow)) >= longest(list(rule.disallow));
}

const groups = () => robots().rules as Rule[];

test('robots: every user-agent group blocks the three handlers that 4xx on GET', () => {
  // A user-agent group inherits nothing from the `*` group, so a per-bot rule that forgot
  // the Disallow would leave that bot hitting endpoints that answer its GET with an error.
  for (const rule of groups()) {
    for (const path of ['/api/v1/screen', '/api/v1/drift', '/api/waitlist']) {
      assert.equal(allows(rule, path), false, `${rule.userAgent} may crawl ${path} (405/400 on GET)`);
    }
  }
});

test('robots: the $ anchor keeps /api/v1/drift/any reachable', () => {
  // /api/v1/drift has child routes and /api/v1/drift/any is published to agents at
  // app/llms.txt/route.ts:129. An unanchored `/api/v1/drift` Disallow is a prefix rule and
  // would take the child down with the parent — silently, since the parent test above would
  // still pass. This is the regression that anchor exists to prevent.
  for (const rule of groups()) {
    assert.equal(
      allows(rule, '/api/v1/drift/any'),
      true,
      `${rule.userAgent} is blocked from /api/v1/drift/any — the Disallow lost its $ anchor`,
    );
  }
});

test('robots: internally-linked API endpoints stay crawlable', () => {
  // These are linked from real anchors: /docs -> /api/v1/recommend?task=… (200), and
  // /ledger + DriftReport -> /api/v1/ledger (200). Both already carry X-Robots-Tag: noindex
  // from vercel.json. Blocking a LINKED url instead of noindexing it is how you get
  // "Indexed, though blocked by robots.txt" — Google keeps the URL precisely because it
  // cannot fetch it to read the header saying drop it. Broadening the Disallow to /api/
  // re-creates that, and did once already.
  //
  // Scoped to the groups that actually feed a SEARCH INDEX: `*` (Googlebot, Bingbot, and
  // everything unnamed) plus the retrieval crawlers. The training groups deliberately lose
  // /api/v1/ledger under spec P3, and that is not the same hazard — an indexless corpus
  // crawler has no SERP to strand a url in. Google-Extended in particular is a training
  // opt-out token, not a Search crawler; it cannot affect indexing either way.
  const searchFacing = groups().filter(
    (r) => r.userAgent === '*' || ['ChatGPT-User', 'OAI-SearchBot', 'PerplexityBot'].includes(r.userAgent as string),
  );
  assert.equal(searchFacing.length, 4, 'expected `*` plus 3 retrieval crawlers');
  for (const rule of searchFacing) {
    for (const path of ['/api/v1/recommend', '/api/v1/ledger']) {
      assert.equal(allows(rule, path), true, `${rule.userAgent} is blocked from linked ${path}`);
    }
  }
});

test('robots: the agent API contract stays fetchable by agent crawlers', () => {
  // /llms.txt:124-132 publishes these as the agent-facing API and :143 tells MCP clients to
  // point at /api/mcp; /.well-known/mcp-index.json republishes the list. Serving agents a
  // document that advertises endpoints their robots.txt forbids is incoherent, and
  // lib/apiUsage.ts counts /api/mcp and /api/v1/preflight as a tracked metric.
  for (const rule of groups()) {
    for (const path of ['/api/mcp', '/api/v1/preflight', '/api/v1/search', '/api/v1/trust/server/x']) {
      assert.equal(allows(rule, path), true, `${rule.userAgent} is blocked from advertised ${path}`);
    }
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

test('robots: training crawlers lose the two bulk-corpus surfaces, nothing else', () => {
  // Posture-by-path (spec P3): the thesis is deliberately given to training crawlers, only
  // wholesale extraction is withheld. So this asserts BOTH directions — a rule that closed
  // /guides or /whitepaper to them would defeat the point as surely as one that left
  // /llms-full.txt open.
  const training = ['GPTBot', 'anthropic-ai', 'ClaudeBot', 'cohere-ai', 'Google-Extended'];
  for (const rule of groups().filter((r) => training.includes(r.userAgent as string))) {
    for (const path of ['/llms-full.txt', '/api/v1/ledger']) {
      assert.equal(allows(rule, path), false, `${rule.userAgent} can still bulk-fetch ${path}`);
    }
    for (const path of ['/guides/how-to-trust-an-mcp-server', '/whitepaper', '/methodology', '/docs', '/llms.txt']) {
      assert.equal(allows(rule, path), true, `${rule.userAgent} is blocked from thesis surface ${path}`);
    }
  }
});

test('robots: retrieval crawlers keep everything, including bulk', () => {
  // These cite and send traffic, which is the AEO play. Withholding from them costs
  // reach and protects nothing — they are not building a corpus.
  const retrieval = ['ChatGPT-User', 'OAI-SearchBot', 'PerplexityBot'];
  const seen = groups().filter((r) => retrieval.includes(r.userAgent as string));
  assert.equal(seen.length, retrieval.length, 'a retrieval crawler group went missing');
  for (const rule of seen) {
    for (const path of ['/llms-full.txt', '/api/v1/ledger', '/guides/x']) {
      assert.equal(allows(rule, path), true, `${rule.userAgent} is blocked from ${path}`);
    }
  }
});

test('robots: every named AI crawler is classified exactly once', () => {
  // The failure mode this catches is a bot added to one list and forgotten in the other, or
  // duplicated into both — where the last-wins group silently decides its posture.
  const named = groups().map((r) => r.userAgent as string).filter((u) => u !== '*');
  assert.equal(new Set(named).size, named.length, `duplicate user-agent group: ${named.join(', ')}`);
  assert.equal(named.length, 8, 'expected 8 named AI crawlers across the two classes');
});

test('robots: still advertises the sitemap and canonical host', () => {
  const r = robots();
  assert.equal(r.sitemap, 'https://mcpindex.ai/sitemap.xml');
  assert.equal(r.host, 'https://mcpindex.ai');
});
