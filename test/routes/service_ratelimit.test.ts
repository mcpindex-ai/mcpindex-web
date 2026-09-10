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

// The bulk-export budget on /api/v1/ledger. Separate key, separate ceiling: that route is the
// only one on the shared drift-read budget that returns the WHOLE blob, and the drain rewrites
// the blob once an hour, so nothing legitimate asks for it more than a few times a minute.
// A Redis that actually counts per key, so these can assert on WHICH budget was spent.
function countingRedis(): { client: any; hits: Map<string, number> } {
  const hits = new Map<string, number>();
  return {
    hits,
    client: {
      async incr(k: string) { const n = (hits.get(k) ?? 0) + 1; hits.set(k, n); return n; },
      async expire() { return 1; },
      async get() { return null; },
    } as any,
  };
}
const keysMatching = (hits: Map<string, number>, prefix: string) =>
  [...hits.keys()].filter((k) => k.startsWith(prefix));

test('ledger: the 11th request in a minute from one IP is 429, the 10th is not', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client } = countingRedis();
  __setRatelimitRedisForTest(client);
  // The blob itself is unavailable here (no ledger redis injected), so a request that PASSES the
  // limiter lands on 503. What matters is 503 vs 429: the limiter let it through either way.
  for (let i = 1; i <= 10; i++) {
    const r = await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
    assert.notEqual(r.status, 429, `request ${i} must not be rate limited`);
  }
  const r = await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '60');
});

test('ledger: the bulk budget is per-IP, so one heavy client cannot 429 another', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client } = countingRedis();
  __setRatelimitRedisForTest(client);
  for (let i = 0; i < 11; i++) await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
  const other = await callRoute(ledger, '/api/v1/ledger', { ip: '8.8.8.8' });
  assert.notEqual(other.status, 429);
});

test('ledger: a throttled bulk client does NOT spend the shared drift-read budget', async () => {
  // The whole reason this is a separate counter. /api/v1/drift/any is the installed SDK's gate
  // check and bursts by design; a ledger scraper must not eat into it.
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client, hits } = countingRedis();
  __setRatelimitRedisForTest(client);
  for (let i = 0; i < 20; i++) await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
  const bulk = keysMatching(hits, 'ledger:read:ip:');
  const shared = keysMatching(hits, 'drift:read:ip:');
  assert.equal(bulk.length, 1, 'one bulk key for one IP+minute');
  assert.equal(hits.get(bulk[0]), 20, 'every request counted against the bulk budget');
  // 10 allowed through to the shared check; the other 10 were refused before reaching it.
  assert.equal(shared.length, 1);
  assert.equal(hits.get(shared[0]), 10, 'refused requests must not spend the shared allowance');
});

test('ledger: unconfigured Redis fails OPEN, never 429s a public read surface', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  __setRatelimitRedisForTest(null);
  for (let i = 0; i < 30; i++) {
    const r = await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
    assert.notEqual(r.status, 429);
  }
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
