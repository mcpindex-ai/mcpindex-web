// Tier 2 — the 429 branch of every service-backed limiter, via __setRatelimitRedisForTest + an
// over-limit Redis mock. One seam unlocks the rate-limit branch across the whole limiter family.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, snapshotEnv, overLimitRedis, mockRedis } from './_harness';
import { __setRatelimitRedisForTest } from '../../lib/ratelimit';
import { __setDriftIdentityRedisForTest } from '../../lib/driftIdentity';

import { POST as screen } from '../../app/api/v1/screen/route';
import { POST as driftIngest } from '../../app/api/v1/drift/route';
import { GET as driftAnyGet } from '../../app/api/v1/drift/any/route';
import { POST as driftRegister } from '../../app/api/v1/drift/register/route';
import { POST as receiptsPost } from '../../app/api/v1/receipts/route';
import { GET as ledger } from '../../app/api/v1/ledger/route';
import { GET as loginStart } from '../../app/api/auth/login/start/route';
import { POST as waitlist } from '../../app/api/waitlist/route';
import { POST as enterprise } from '../../app/api/enterprise/route';

let restore: () => void;
beforeEach(() => {
  restore = snapshotEnv();
  __setRatelimitRedisForTest(overLimitRedis());
});
afterEach(() => {
  restore();
  __setRatelimitRedisForTest(undefined);
  __setDriftIdentityRedisForTest(undefined);
});

const validSignal = {
  v: 1, event: 'pin', server_fp: '0b4796d16feb3912c0db0824c39e9b70', tool_fp: '109fa3f411a148f7e96f9bebb15d5799',
  prev_hash: null, new_hash: 'sha256:077fa7e7823cffdf3372a607f5f1ad0a46c1a79ee58795307f9d8ba686e4a184',
  change_kinds: null, safety_relevant: false, at_hour: '2026-06-09T05:00:00Z', sdk: 'ts', install_id: FIX.ID32_OK,
};

test('screen: over-limit → 429 with retry-after', async () => {
  const r = await callRoute(screen, '/api/v1/screen', { method: 'POST', body: { description: 'x' }, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
  assert.ok(r.headers.get('retry-after'));
});

test('drift ingest: over-limit → 429', async () => {
  const r = await callRoute(driftIngest, '/api/v1/drift', { method: 'POST', body: { signals: [validSignal] }, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
});

test('drift/any GET: over-limit → 429', async () => {
  const r = await callRoute(driftAnyGet, '/api/v1/drift/any', { query: { fp: FIX.FP32_OK }, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
});

test('drift/register: enabled + over-limit → 429', async () => {
  process.env.DRIFT_IDENTITY = '1';
  __setDriftIdentityRedisForTest(mockRedis());
  const r = await callRoute(driftRegister, '/api/v1/drift/register', { method: 'POST', body: { install_id: FIX.ID32_OK }, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
});

test('receipts POST: over-limit → 429', async () => {
  const r = await callRoute(receiptsPost, '/api/v1/receipts', { method: 'POST', body: { receipts: [] }, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
});

test('ledger: enabled + over-limit → 429', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const r = await callRoute(ledger, '/api/v1/ledger', { ip: '9.9.9.9' });
  assert.equal(r.status, 429);
});

test('login/start: enabled + over-limit → 429', async () => {
  process.env.MCPINDEX_LOGIN_ENABLED = '1';
  const r = await callRoute(loginStart, '/api/auth/login/start', { ip: '9.9.9.9' });
  assert.equal(r.status, 429);
});

// Lead forms email a caller-supplied recipient when Brevo is configured; the limiter must
// 429 BEFORE any send. (overLimitRedis is active via beforeEach.)
test('waitlist (contact, Brevo on): over-limit → 429 before send', async () => {
  process.env.BREVO_API_KEY = 'k';
  process.env.BREVO_LEADS_LIST_ID = '3';
  const r = await callRoute(waitlist, '/api/waitlist', {
    method: 'POST',
    body: { email: 'a@b.co', source: 'contact' },
    ip: '9.9.9.9',
  });
  assert.equal(r.status, 429);
  assert.ok(r.headers.get('retry-after'));
});

test('enterprise (Brevo on): over-limit → 429 before send', async () => {
  process.env.BREVO_API_KEY = 'k';
  process.env.BREVO_LEADS_LIST_ID = '3';
  const r = await callRoute(enterprise, '/api/enterprise', {
    method: 'POST',
    body: { email: 'a@b.co', company: 'Acme' },
    ip: '9.9.9.9',
  });
  assert.equal(r.status, 429);
});
