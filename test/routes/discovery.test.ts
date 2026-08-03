// File-backed discovery routes: A4 server/[slug], A5 search, A6 recommend, A7 preflight, A8 diff,
// A9 registry-count. All read committed data/*.json (KV-preferred, file fallback when Upstash unset).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, screenedSlug } from './_harness';
import { GET as server } from '../../app/api/v1/server/[slug]/route';
import { GET as search } from '../../app/api/v1/search/route';
import { GET as recommend } from '../../app/api/v1/recommend/route';
import { GET as preflight } from '../../app/api/v1/preflight/route';
import { GET as diff } from '../../app/api/v1/diff/route';
import { GET as servers } from '../../app/api/v1/servers/route';
import { GET as registryCount } from '../../app/api/registry-count/route';

const obj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

// ---- A4 server/[slug] ----
test('server/[slug]: known slug → 200 with the right, full detail body', async () => {
  const slug = await screenedSlug();
  const r = await callRoute(server, `/api/v1/server/${slug}`, { params: { slug } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.slug, slug); // right server, not a 200 with the wrong/blank one
  assert.ok(Object.keys(b).length > 3); // a full detail object, not a truncated stub
});

// Guard against ADVERSE SELECTION in the dynamic screenedSlug() pick: a regression that
// grays out a whole CLASS of screened servers (a binding/normalize bug dropping every
// record with a server_id, say) would be invisible to suites that only ever see one
// surviving slug. The floor is far below today's ~10.6k screened records but far above
// zero, so it reds on "most of the corpus went gray" while staying immune to data aging.
test('screened corpus floor: a collapse of listScreened() is a code bug, not data aging', async () => {
  const { listScreened } = await import('../../lib/verdicts');
  assert.ok((await listScreened()).length > 100);
});

test('server/[slug]: unknown slug → 404 not_found', async () => {
  const r = await callRoute(server, `/api/v1/server/${FIX.UNKNOWN}`, { params: { slug: FIX.UNKNOWN } });
  assert.equal(r.status, 404);
  assert.equal(obj(r).error, 'not_found');
});

// ---- A5 search ----
test('search: missing q → 400', async () => {
  const r = await callRoute(search, '/api/v1/search');
  assert.equal(r.status, 400);
});

test('search: q=github → 200 with results envelope', async () => {
  const r = await callRoute(search, '/api/v1/search', { query: { q: 'github' } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.query, 'github');
  assert.ok(Array.isArray(b.results));
  assert.equal(typeof b.total, 'number');
});

test('search: garbage/negative limit stays bounded (never 500, never leaks all-but-one)', async () => {
  // NaN limit -> falls back to the default (10), bounded.
  const nan = await callRoute(search, '/api/v1/search', { query: { q: 'github', limit: 'abc' } });
  assert.ok(nan.status < 500);
  assert.ok(Array.isArray(obj(nan).results) && obj(nan).results.length <= 50);
  // Negative limit must clamp to >=1, NOT reach slice(0,-1) (which would return all-but-one hit).
  const neg = await callRoute(search, '/api/v1/search', { query: { q: 'github', limit: '-1' } });
  assert.ok(neg.status < 500);
  assert.ok(obj(neg).results.length <= 50);
});

// ---- A6 recommend ----
test('recommend: missing task → 400', async () => {
  const r = await callRoute(recommend, '/api/v1/recommend');
  assert.equal(r.status, 400);
});

test('recommend: task → 200 with a bounded recommendations array', async () => {
  const r = await callRoute(recommend, '/api/v1/recommend', { query: { task: 'read a file' } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.ok(Array.isArray(b.recommendations) && b.recommendations.length <= 3); // route caps at top-3
});

// ---- A7 preflight ----
test('preflight: missing task → 400', async () => {
  const r = await callRoute(preflight, '/api/v1/preflight');
  assert.equal(r.status, 400);
});

test('preflight: task too long (>256) → 400', async () => {
  const r = await callRoute(preflight, '/api/v1/preflight', { query: { task: 'a'.repeat(300) } });
  assert.equal(r.status, 400);
  assert.match(String(obj(r).error), /too long/i);
});

test('preflight: valid task → 200 with the advisory contract fields', async () => {
  const r = await callRoute(preflight, '/api/v1/preflight', { query: { task: 'read a file' } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.task, 'read a file');
  assert.ok(Array.isArray(b.recommendations));
  // the load-bearing advisory-boundary fields (the whole point of preflight)
  assert.equal(b.verdict_contract_version, '1.0.0');
  assert.ok('honest_limits' in b);
  assert.ok(b.verdict === null || typeof b.verdict === 'object');
});

// ---- A8 diff ----
test('diff: missing since → 400', async () => {
  const r = await callRoute(diff, '/api/v1/diff');
  assert.equal(r.status, 400);
});

test('diff: invalid date → 400', async () => {
  const r = await callRoute(diff, '/api/v1/diff', { query: { since: 'not-a-date' } });
  assert.equal(r.status, 400);
});

test('diff: valid since → 200 with diff envelope', async () => {
  const r = await callRoute(diff, '/api/v1/diff', { query: { since: '2026-01-01' } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.ok('added' in b && 'updated' in b && 'counts' in b);
  // invariant, not exact value: the field is present and well-typed (null when unset, else a string)
  assert.ok(b.snapshot_version === null || typeof b.snapshot_version === 'string');
  assert.ok(Array.isArray(b.added) && b.added.length <= 100);
});

// ---- A9 registry-count ----
test('registry-count: 200 shape', async () => {
  const r = await callRoute(registryCount, '/api/registry-count');
  assert.equal(r.status, 200);
  const b = obj(r);
  // > 0, not just numeric: {servers:0,categories:0} is exactly the shape a registry-load FAILURE returns
  assert.ok(b.servers > 0, `servers should be > 0, got ${b.servers}`);
  assert.ok(b.categories > 0, `categories should be > 0, got ${b.categories}`);
});

// ---- A10 servers (public browse feed for registry-of-registries consumers) ----
test('servers: 200 with the browse envelope', async () => {
  const r = await callRoute(servers, '/api/v1/servers');
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.ok(Array.isArray(b.servers) && b.servers.length > 0);
  assert.equal(typeof b.total, 'number'); // active-corpus size
  assert.equal(b.returned, b.servers.length); // returned == page size
  assert.ok(b.total >= b.returned); // a page, never larger than the corpus
  // each item carries the shared list-item fields a consumer maps from
  for (const s of b.servers) {
    for (const k of ['slug', 'name', 'title', 'description', 'category', 'qualityScore', 'url']) {
      assert.ok(k in s, `missing ${k}`);
    }
  }
});

test('servers: default page is bounded at 100 and sorted by qualityScore desc', async () => {
  const r = await callRoute(servers, '/api/v1/servers');
  const b = obj(r);
  assert.ok(b.servers.length <= 100, `default page should cap at 100, got ${b.servers.length}`);
  for (let i = 1; i < b.servers.length; i++) {
    assert.ok(
      b.servers[i - 1].qualityScore >= b.servers[i].qualityScore,
      'servers must be ranked by qualityScore descending',
    );
  }
});

test('servers: limit is honored and hard-capped at 250', async () => {
  const r5 = await callRoute(servers, '/api/v1/servers', { query: { limit: '5' } });
  assert.ok(obj(r5).servers.length <= 5);
  const rBig = await callRoute(servers, '/api/v1/servers', { query: { limit: '99999' } });
  assert.ok(obj(rBig).servers.length <= 250, 'limit must be hard-capped at 250');
});

test('servers: garbage limit falls back to the default, never 500s or dumps the corpus', async () => {
  const r = await callRoute(servers, '/api/v1/servers', { query: { limit: 'abc' } });
  assert.ok(r.status < 500);
  const b = obj(r);
  assert.ok(Array.isArray(b.servers) && b.servers.length <= 100);
});

test('servers: category filter narrows the pool', async () => {
  const all = obj(await callRoute(servers, '/api/v1/servers'));
  const cat = all.servers[0]?.category;
  assert.ok(cat, 'need at least one categorized server to test the filter');
  const r = await callRoute(servers, '/api/v1/servers', { query: { category: cat } });
  const b = obj(r);
  assert.equal(r.status, 200);
  assert.ok(b.total <= all.total); // filtered corpus is a subset
  for (const s of b.servers) assert.equal(s.category, cat);
});
