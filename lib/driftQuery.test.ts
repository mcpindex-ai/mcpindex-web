// Unit tests for the fleet drift-query lookup (M3, read side). Pins the fail-OPEN contract
// (no cache => `drifted: null`, never a false `false`) and the fp-shape gate. Run with
// `npm test` (tsx + node:test). Live Redis hits are not exercised here (no creds in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupCorroborated, metaToResult, FP_RE, MAX_FPS, type DriftAny } from './driftQuery';

const FP = '0b4796d16feb3912c0db0824c39e9b70'; // 32 hex

test('FP_RE accepts exactly 32 lowercase hex, rejects everything else', () => {
  assert.ok(FP_RE.test(FP));
  assert.equal(FP_RE.test(''), false);
  assert.equal(FP_RE.test('ZZ4796d16feb3912c0db0824c39e9b70'), false);
  assert.equal(FP_RE.test(FP + 'aa'), false); // too long
  assert.equal(FP_RE.test('0b4796d16feb3912c0db0824c39e9b7'), false); // 31
  assert.equal(FP_RE.test('https://internal.corp/secret'), false); // no raw strings
});

test('fail-open: with no Upstash configured, every fp resolves to drifted:null (unknown)', async () => {
  // Ensure no creds are visible to the module's lazy redis() (first call in this process).
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const res = await lookupCorroborated([FP, 'a'.repeat(32)]);
  const a = res[FP] as DriftAny;
  assert.deepEqual(a, { drifted: null });
  assert.deepEqual(res['a'.repeat(32)] as DriftAny, { drifted: null });
});

test('MAX_FPS batch cap is a sane bound', () => {
  assert.equal(MAX_FPS, 256);
});

test('metaToResult: change_kinds allowlist-parsed; missing meta -> drifted:true with []', () => {
  // A SET hit with no meta still reports drifted:true (honest floor), now with empty change_kinds.
  assert.deepEqual(metaToResult(null), {
    drifted: true,
    sources: 1,
    safety_relevant: false,
    last_seen: null,
    change_kinds: [],
  });
  // Meta carries change_kinds as a JSON string (Redis HASH) OR an array (auto-deser) — both parse,
  // and an unknown kind is dropped.
  const fromStr = metaToResult({ sources: '1', safety_relevant: '1', change_kinds: '["type-changed","bogus"]' });
  assert.deepEqual(fromStr, {
    drifted: true,
    sources: 1,
    safety_relevant: true,
    last_seen: null,
    change_kinds: ['type-changed'],
  });
  const fromArr = metaToResult({ sources: 1, change_kinds: ['removed-param', 'removed-param'] });
  assert.deepEqual((fromArr as Extract<DriftAny, { drifted: true }>).change_kinds, ['removed-param']);
});
