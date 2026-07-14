// File-backed discovery routes: A4 server/[slug], A5 search, A6 recommend, A7 preflight, A8 diff,
// A9 registry-count. All read committed data/*.json (KV-preferred, file fallback when Upstash unset).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX } from './_harness';
import { GET as server } from '../../app/api/v1/server/[slug]/route';
import { GET as search } from '../../app/api/v1/search/route';
import { GET as recommend } from '../../app/api/v1/recommend/route';
import { GET as preflight } from '../../app/api/v1/preflight/route';
import { GET as diff } from '../../app/api/v1/diff/route';
import { GET as registryCount } from '../../app/api/registry-count/route';

const obj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

// ---- A4 server/[slug] ----
test('server/[slug]: known slug → 200 with the right, full detail body', async () => {
  const r = await callRoute(server, `/api/v1/server/${FIX.SCREENED}`, { params: { slug: FIX.SCREENED } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.slug, FIX.SCREENED); // right server, not a 200 with the wrong/blank one
  assert.ok(Object.keys(b).length > 3); // a full detail object, not a truncated stub
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

test('search: garbage limit does not 500 AND still returns a well-formed envelope (NaN edge)', async () => {
  const r = await callRoute(search, '/api/v1/search', { query: { q: 'github', limit: 'abc' } });
  assert.ok(r.status < 500); // must not throw/500 on a NaN limit
  if (r.status === 200) {
    const b = obj(r);
    // a NaN limit must not silently dump the whole corpus / return a malformed shape.
    // (Mechanism: `?? 20` keeps NaN through, then search's slice(0, NaN) -> [] — NOT the 50-cap,
    // which is Math.min(50, NaN)=NaN and doesn't fire. Either way results.length must stay bounded.)
    assert.ok(Array.isArray(b.results));
    assert.ok(b.results.length <= 50);
  }
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
