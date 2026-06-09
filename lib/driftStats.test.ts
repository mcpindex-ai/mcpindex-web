// Unit tests for the drift aggregate counters reader (M5, read side). Pins the integer coercion
// (no fabricated zeros). Run with `npx tsx --test lib/driftStats.test.ts`.
// loadDriftStats lives in driftStatsServer.ts (import 'server-only', not importable in plain node);
// its only logic beyond coerceNonNegInt is `if (!ledgerEnabled()) return null` + a guarded pipeline,
// both trivial and covered by the ledgerEnabled + coerceNonNegInt tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceNonNegInt } from './driftStats';

test('coerceNonNegInt floors floats, clamps negatives, maps NaN/null/undefined to 0', () => {
  assert.equal(coerceNonNegInt(3.9), 3);
  assert.equal(coerceNonNegInt(-5), 0);
  assert.equal(coerceNonNegInt(NaN), 0);
  assert.equal(coerceNonNegInt(null), 0);
  assert.equal(coerceNonNegInt(undefined), 0);
  assert.equal(coerceNonNegInt('12.7'), 12);
});
