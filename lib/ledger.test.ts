// Unit tests for the public drift ledger (M4, read side). Pins coercion gates and the
// flag-off fail-closed path. Run with `npx tsx --test lib/ledger.test.ts`. Live Redis
// hits are not exercised here (no creds in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceEvent, coerceStat, ledgerEnabled, loadLedger } from './ledger';

const FP = '0b4796d16feb3912c0db0824c39e9b70';

test('ledgerEnabled is false when NEXT_PUBLIC_DRIFT_LEDGER is unset or not "1"', () => {
  delete process.env.NEXT_PUBLIC_DRIFT_LEDGER;
  assert.equal(ledgerEnabled(), false);
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '0';
  assert.equal(ledgerEnabled(), false);
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = 'true';
  assert.equal(ledgerEnabled(), false);
});

test('coerceEvent rejects a non-32hex tool_fp', () => {
  assert.equal(coerceEvent({ tool_fp: 'bad' }), null);
  assert.equal(coerceEvent({ tool_fp: FP.slice(0, 31) }), null);
});

test('coerceEvent floors sources to 1 when missing or <1', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.equal(coerceEvent(base)?.sources, 1);
  assert.equal(coerceEvent({ ...base, sources: 0 })?.sources, 1);
  assert.equal(coerceEvent({ ...base, sources: -3 })?.sources, 1);
  assert.equal(coerceEvent({ ...base, sources: 2.7 })?.sources, 2);
});

test('coerceEvent sets safety_relevant true only for boolean true', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.equal(coerceEvent(base)?.safety_relevant, false);
  assert.equal(coerceEvent({ ...base, safety_relevant: true })?.safety_relevant, true);
  assert.equal(coerceEvent({ ...base, safety_relevant: 'true' })?.safety_relevant, false);
  assert.equal(coerceEvent({ ...base, safety_relevant: 1 })?.safety_relevant, false);
});

test('coerceEvent blanks a bad server_fp', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.equal(coerceEvent(base)?.server_fp, '');
  assert.equal(coerceEvent({ ...base, server_fp: 'not-hex' })?.server_fp, '');
  assert.equal(coerceEvent({ ...base, server_fp: FP })?.server_fp, FP);
});

test('coerceEvent keeps an hour-coarsened ISO last_seen and blanks anything else', () => {
  const base = { tool_fp: FP };
  assert.equal(
    coerceEvent({ ...base, last_seen: '2026-06-09T06:00:00Z' })?.last_seen,
    '2026-06-09T06:00:00Z',
  );
  assert.equal(coerceEvent({ ...base, last_seen: '2026-01-01' })?.last_seen, ''); // not the coarsened shape
  assert.equal(coerceEvent({ ...base, last_seen: 'x'.repeat(500) })?.last_seen, ''); // oversized
  assert.equal(coerceEvent({ ...base, last_seen: 42 })?.last_seen, ''); // non-string
});

test('coerceStat clamps negatives and NaN to 0', () => {
  assert.deepEqual(coerceStat({}), {
    tools_observed_drifting: 0,
    total_contract_drifts_observed: 0,
    servers: 0,
    safety_relevant: 0,
  });
  assert.deepEqual(
    coerceStat({
      tools_observed_drifting: -5,
      total_contract_drifts_observed: NaN,
      servers: 3.9,
      safety_relevant: -1,
    }),
    {
      tools_observed_drifting: 0,
      total_contract_drifts_observed: 0,
      servers: 3,
      safety_relevant: 0,
    },
  );
});

test('loadLedger resolves to null when the flag is off', async () => {
  delete process.env.NEXT_PUBLIC_DRIFT_LEDGER;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  assert.equal(await loadLedger(), null);
});
