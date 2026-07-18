// Input length caps on cached read endpoints. A long q/task becomes part of the
// s-maxage edge-cache key, so search + recommend bound their inputs (matching preflight)
// and 400 before doing any ranking work. The cap check runs before loadServers(), so
// these need no snapshot/redis seams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';

import { GET as search } from '../../app/api/v1/search/route';
import { GET as recommend } from '../../app/api/v1/recommend/route';

const LONG = 'a'.repeat(300); // > 256 cap

test('search: over-long q (>256) → 400', async () => {
  const r = await callRoute(search, '/api/v1/search', { query: { q: LONG } });
  assert.equal(r.status, 400);
});

test('search: normal q is not rejected by the cap (→ not 400 "too long")', async () => {
  const r = await callRoute(search, '/api/v1/search', { query: { q: 'github' } });
  assert.notEqual(r.status, 400);
});

test('recommend: over-long task (>256) → 400', async () => {
  const r = await callRoute(recommend, '/api/v1/recommend', { query: { task: LONG } });
  assert.equal(r.status, 400);
});

test('search: over-long category (>256) → 400 (cache-key cap covers category too)', async () => {
  const r = await callRoute(search, '/api/v1/search', { query: { q: 'github', category: LONG } });
  assert.equal(r.status, 400);
});
