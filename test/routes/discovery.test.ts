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
test('server/[slug]: known slug → 200 detail', async () => {
  const r = await callRoute(server, `/api/v1/server/${FIX.SCREENED}`, { params: { slug: FIX.SCREENED } });
  assert.equal(r.status, 200);
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

test('search: garbage limit does not 500 (NaN edge)', async () => {
  const r = await callRoute(search, '/api/v1/search', { query: { q: 'github', limit: 'abc' } });
  assert.ok(r.status === 200 || r.status === 400); // must not throw/500
  assert.ok(r.status < 500);
});

// ---- A6 recommend ----
test('recommend: missing task → 400', async () => {
  const r = await callRoute(recommend, '/api/v1/recommend');
  assert.equal(r.status, 400);
});

test('recommend: task → 200 with recommendations', async () => {
  const r = await callRoute(recommend, '/api/v1/recommend', { query: { task: 'read a file' } });
  assert.equal(r.status, 200);
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

test('preflight: valid task → 200, contract v1.0.0', async () => {
  const r = await callRoute(preflight, '/api/v1/preflight', { query: { task: 'read a file' } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.task, 'read a file');
  assert.ok(Array.isArray(b.recommendations));
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
  assert.equal(typeof b.servers, 'number');
  assert.equal(typeof b.categories, 'number');
});
