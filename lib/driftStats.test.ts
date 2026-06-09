// Unit tests for the drift aggregate counters reader (M5, read side). Pins the fail-CLOSED
// contract (no cache => null, never fabricated zeros) and integer coercion. Run with
// `npx tsx --test lib/driftStats.test.ts`. Live Redis hits are not exercised here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceNonNegInt, loadDriftStats } from './driftStats';

test('fail-closed: flag on but no Upstash configured, loadDriftStats resolves to null', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1'; // past the defense-in-depth flag guard...
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const res = await loadDriftStats(); // ...so this null is the Redis-unconfigured path
  assert.equal(res, null);
});

test('flag off: loadDriftStats resolves to null (defense-in-depth, pre-go-live)', async () => {
  delete process.env.NEXT_PUBLIC_DRIFT_LEDGER;
  const res = await loadDriftStats();
  assert.equal(res, null);
});

test('coerceNonNegInt floors floats, clamps negatives, maps NaN/null/undefined to 0', () => {
  assert.equal(coerceNonNegInt(3.9), 3);
  assert.equal(coerceNonNegInt(-5), 0);
  assert.equal(coerceNonNegInt(NaN), 0);
  assert.equal(coerceNonNegInt(null), 0);
  assert.equal(coerceNonNegInt(undefined), 0);
  assert.equal(coerceNonNegInt('12.7'), 12);
});
