// Tier 2 — the 429 branch of every service-backed limiter, via __setRatelimitRedisForTest + an
// over-limit Redis mock. One seam unlocks the rate-limit branch across the whole limiter family.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, snapshotEnv, overLimitRedis, mockRedis } from './_harness';
import { __setRatelimitRedisForTest, checkServerDriftLimit, ipBucket } from '../../lib/ratelimit';
import { __setDriftIdentityRedisForTest } from '../../lib/driftIdentity';

import { POST as screen } from '../../app/api/v1/screen/route';
import { POST as driftIngest } from '../../app/api/v1/drift/route';
import { GET as driftAnyGet } from '../../app/api/v1/drift/any/route';
import { POST as driftRegister } from '../../app/api/v1/drift/register/route';
import { POST as receiptsPost } from '../../app/api/v1/receipts/route';
import { GET as ledger } from '../../app/api/v1/ledger/route';
import { GET as serverDrift } from '../../app/api/v1/server-drift/route';
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

// The bulk budget on /api/v1/ledger. Separate key, separate ceiling: that route is the only one
// on the shared drift-read budget that pages out the whole corpus. 60/min per IP lets one client
// walk every /4 page inside a minute (see lib/ratelimit.ts for the measured page counts).
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

test('ledger: the 61st request in a minute from one IP is 429, the 60th is not', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client } = countingRedis();
  __setRatelimitRedisForTest(client);
  // The ledger itself is unavailable here (no ledger redis injected), so a request that PASSES the
  // limiter lands on 503. What matters is 503 vs 429: the limiter let it through either way.
  for (let i = 1; i <= 60; i++) {
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
  for (let i = 0; i < 61; i++) await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
  const other = await callRoute(ledger, '/api/v1/ledger', { ip: '8.8.8.8' });
  assert.notEqual(other.status, 429);
});

test('ledger: a throttled bulk client does NOT spend the shared drift-read budget', async () => {
  // The whole reason this is a separate counter. /api/v1/drift/any is the installed SDK's gate
  // check and bursts by design; a ledger scraper must not eat into it.
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client, hits } = countingRedis();
  __setRatelimitRedisForTest(client);
  for (let i = 0; i < 120; i++) await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
  const bulk = keysMatching(hits, 'ledger:read:ip:');
  const shared = keysMatching(hits, 'drift:read:ip:');
  assert.equal(bulk.length, 1, 'one bulk key for one IP+minute');
  assert.equal(hits.get(bulk[0]), 120, 'every request counted against the bulk budget');
  // 60 allowed through to the shared check; the other 60 were refused before reaching it.
  assert.equal(shared.length, 1);
  assert.equal(hits.get(shared[0]), 60, 'refused requests must not spend the shared allowance');
});

test('ledger: unconfigured Redis fails OPEN, never 429s a public read surface', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  __setRatelimitRedisForTest(null);
  for (let i = 0; i < 70; i++) {
    const r = await callRoute(ledger, '/api/v1/ledger', { ip: '7.7.7.7' });
    assert.notEqual(r.status, 429);
  }
});

// /api/v1/server-drift: open by name, closed to bulk pulls (GB 2026-10-20). Own budget, off the
// shared drift-read counter, and fail-CLOSED where every sibling fails open.
const SD = { query: { server: 'io.github.example/server' } };

test('server-drift: enabled + over-limit → 429', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const r = await callRoute(serverDrift, '/api/v1/server-drift', { ...SD, ip: '9.9.9.9' });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '60');
});

test('server-drift: the 31st request in a minute from one IP is 429, the 30th is not', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client } = countingRedis();
  __setRatelimitRedisForTest(client);
  // No ledger store is injected, so a request that passes the limiter lands on 503. 503 vs 429 is
  // the assertion: the limiter let it through.
  for (let i = 1; i <= 30; i++) {
    const r = await callRoute(serverDrift, '/api/v1/server-drift', { ...SD, ip: '7.7.7.7' });
    assert.notEqual(r.status, 429, `request ${i} must not be rate limited`);
  }
  const r = await callRoute(serverDrift, '/api/v1/server-drift', { ...SD, ip: '7.7.7.7' });
  assert.equal(r.status, 429);
  const other = await callRoute(serverDrift, '/api/v1/server-drift', { ...SD, ip: '8.8.8.8' });
  assert.notEqual(other.status, 429, 'the budget is per IP');
});

test('server-drift: spends its own budget, never the shared drift-read one', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client, hits } = countingRedis();
  __setRatelimitRedisForTest(client);
  for (let i = 0; i < 40; i++) await callRoute(serverDrift, '/api/v1/server-drift', { ...SD, ip: '7.7.7.7' });
  assert.equal(keysMatching(hits, 'drift:read:').length, 0, 'drift/any budget untouched');
  const own = keysMatching(hits, 'server-drift:ip:');
  assert.equal(own.length, 1);
  assert.equal(hits.get(own[0]), 40);
  // Refused requests do not count toward the daily ceiling.
  const global = keysMatching(hits, 'server-drift:global:');
  assert.equal(hits.get(global[0]), 30);
});

test('server-drift: the daily ceiling refuses once spent, from any IP', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  __setRatelimitRedisForTest({
    async incr(k: string) { return k.startsWith('server-drift:global:') ? 100_001 : 1; },
    async expire() { return 1; },
  } as any);
  const r = await callRoute(serverDrift, '/api/v1/server-drift', { ...SD, ip: '6.6.6.6' });
  assert.equal(r.status, 429);
});

// The route answers 503 either way when the ledger store is absent too, so these assert on the
// limiter's own verdict; a route-level 503 alone would pass with a fail-open limiter.
test('server-drift: unconfigured Redis fails CLOSED, never an unthrottled window', async () => {
  __setRatelimitRedisForTest(null);
  assert.deepEqual(await checkServerDriftLimit('7.7.7.7', new Date()), { ok: false, reason: 'unavailable' });
});

test('server-drift: a Redis error fails CLOSED', async () => {
  __setRatelimitRedisForTest({ async incr() { throw new Error('down'); }, async expire() { return 1; } } as any);
  assert.deepEqual(await checkServerDriftLimit('7.7.7.7', new Date()), { ok: false, reason: 'unavailable' });
});

test('server-drift: the daily ceiling tells the client to come back at UTC midnight', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  __setRatelimitRedisForTest({
    async incr(k: string) { return k.startsWith('server-drift:global:') ? 100_001 : 1; },
    async expire() { return 1; },
  } as any);
  const r = await callRoute(serverDrift, '/api/v1/server-drift', { ...SD, ip: '6.6.6.6' });
  const retry = Number(r.headers.get('retry-after'));
  assert.ok(retry > 60 || new Date().getUTCHours() === 23, `retry-after ${retry}`);
  assert.ok(retry <= 86_400);
});

test('server-drift: IPv6 callers share one bucket per /64', async () => {
  assert.equal(ipBucket('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(ipBucket('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
  assert.equal(ipBucket('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(ipBucket('::ffff:1.2.3.4'), '1.2.3.4');
  assert.equal(ipBucket('1.2.3.4'), '1.2.3.4');
  assert.equal(ipBucket('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(ipBucket('not:an:ip::x:y::z'), 'not:an:ip::x:y::z');
  assert.equal(ipBucket('unknown'), 'unknown');
  const { client, hits } = countingRedis();
  __setRatelimitRedisForTest(client);
  for (let i = 1; i <= 31; i++) await checkServerDriftLimit(`2001:db8:1:2::${i.toString(16)}`, new Date());
  assert.deepEqual(await checkServerDriftLimit('2001:db8:1:2::ff', new Date()), { ok: false, reason: 'ip' });
  assert.equal(keysMatching(hits, 'server-drift:ip:').length, 1);
});

test('server-drift: a malformed request is 400 and spends no budget', async () => {
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  const { client, hits } = countingRedis();
  __setRatelimitRedisForTest(client);
  const r = await callRoute(serverDrift, '/api/v1/server-drift', { ip: '7.7.7.7' });
  assert.equal(r.status, 400);
  assert.equal(hits.size, 0);
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
