// Service-backed ENABLED paths via the existing lib __set*RedisForTest seams + a mockRedis.
// Covers the identity-minting matrix (drift/register) and the drift ingest 204 success path.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, snapshotEnv, mockRedis } from './_harness';
import { POST as driftRegister, DELETE as driftUnregister } from '../../app/api/v1/drift/register/route';
import { POST as driftIngest } from '../../app/api/v1/drift/route';
import { __setDriftIdentityRedisForTest } from '../../lib/driftIdentity';
import { __setDriftIngestRedisForTest } from '../../lib/driftIngest';

let restore: () => void;
beforeEach(() => { restore = snapshotEnv(); });
afterEach(() => {
  restore();
  __setDriftIdentityRedisForTest(undefined);
  __setDriftIngestRedisForTest(undefined);
});
const obj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

const VALID_SIGNAL = {
  v: 1, event: 'pin',
  server_fp: '0b4796d16feb3912c0db0824c39e9b70',
  tool_fp: '109fa3f411a148f7e96f9bebb15d5799',
  prev_hash: null,
  new_hash: 'sha256:077fa7e7823cffdf3372a607f5f1ad0a46c1a79ee58795307f9d8ba686e4a184',
  change_kinds: null, safety_relevant: false,
  at_hour: '2026-06-09T05:00:00Z', sdk: 'ts', install_id: FIX.ID32_OK,
} as const;

// ---- B4 drift/register — identity minting (DRIFT_IDENTITY=1) ----
test('drift/register: enabled + fresh Redis → 200 with install_token', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIdentityRedisForTest(mockRedis());
  const r = await callRoute(driftRegister, '/api/v1/drift/register', { method: 'POST', body: { install_id: FIX.ID32_OK } });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.install_id, FIX.ID32_OK);
  assert.match(String(b.install_token), /^[0-9a-f]{64}$/);
});

test('drift/register: enabled + Redis down (null) → 503 identity_store_unavailable', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIdentityRedisForTest(null);
  const r = await callRoute(driftRegister, '/api/v1/drift/register', { method: 'POST', body: { install_id: FIX.ID32_OK } });
  assert.equal(r.status, 503);
});

test('drift/register: enabled + bad install_id → 400', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIdentityRedisForTest(mockRedis());
  const r = await callRoute(driftRegister, '/api/v1/drift/register', { method: 'POST', body: { install_id: FIX.ID32_BAD } });
  assert.equal(r.status, 400);
});

test('drift/register: enabled + wrong content-type → 415', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIdentityRedisForTest(mockRedis());
  const r = await callRoute(driftRegister, '/api/v1/drift/register', { method: 'POST', raw: 'x', headers: { 'content-type': 'text/plain' } });
  assert.equal(r.status, 415);
});

test('drift/register DELETE: enabled + no bearer → 401', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIdentityRedisForTest(mockRedis());
  const r = await callRoute(driftUnregister, '/api/v1/drift/register', { method: 'DELETE', query: { install_id: FIX.ID32_OK } });
  assert.equal(r.status, 401);
});

test('drift/register DELETE: enabled + unknown identity → 404 revoked:false', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIdentityRedisForTest(mockRedis());
  const r = await callRoute(driftUnregister, '/api/v1/drift/register', {
    method: 'DELETE', query: { install_id: FIX.ID32_OK }, headers: { authorization: 'Bearer ' + 'f'.repeat(64) },
  });
  assert.equal(r.status, 404);
});

// ---- B2 drift ingest — 204 success ----
test('drift ingest: valid batch → 204', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIngestRedisForTest(mockRedis());
  __setDriftIdentityRedisForTest(mockRedis());
  const r = await callRoute(driftIngest, '/api/v1/drift', { method: 'POST', body: { signals: [VALID_SIGNAL] } });
  assert.equal(r.status, 204);
});

test('drift ingest: invalid signal shape → 400 invalid_signal (no echo)', async () => {
  __setDriftIngestRedisForTest(mockRedis());
  const r = await callRoute(driftIngest, '/api/v1/drift', { method: 'POST', body: { signals: [{ bogus: true }] } });
  assert.equal(r.status, 400);
});
