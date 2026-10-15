// Active-key recording on the owner proxy (lib/activeKeys.ts). Proves the two things the hot
// path promises: a key the upstream accepted lands in today's bucket as its sha256, and a broken
// or hung Upstash can neither fail nor slow the response.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { POST as owner } from '../../app/api/owner/[action]/route';
import {
  __setActiveKeysRedisForTest,
  __setActiveKeysWriteTimeoutForTest,
  bucketKey,
  dayStamp,
  keyId,
  type ActiveKeysRedis,
} from '../../lib/activeKeys';
import { __setRatelimitRedisForTest } from '../../lib/ratelimit';

const KEY = 'mcpk_' + 'Q9w8E7r6T5y4U3i2';
const SERVER = 'io.github.you/srv';

let restoreFetch: (() => void) | null = null;
function upstream(status: number, body: unknown = {}): void {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  restoreFetch = () => { globalThis.fetch = orig; };
}

beforeEach(() => {
  __setRatelimitRedisForTest(null); // limiter fail-open, never live Redis
  __setActiveKeysRedisForTest(null);
});
afterEach(() => {
  restoreFetch?.();
  restoreFetch = null;
  __setActiveKeysRedisForTest(null);
  __setActiveKeysWriteTimeoutForTest(undefined);
  __setRatelimitRedisForTest(undefined);
});

function recorder(execImpl?: () => Promise<unknown[]>) {
  const writes: [string, string][] = [];
  const client: ActiveKeysRedis = {
    pipeline() {
      const p = {
        sadd(k: string, m: string) { writes.push([k, m]); return p; },
        expire() { return p; },
        smembers() { return p; },
        exec: execImpl ?? (() => Promise.resolve([1, 1])),
      };
      return p;
    },
  };
  return { client, writes };
}

const flush = () => new Promise((r) => setTimeout(r, 20));
const call = () =>
  callRoute(owner, '/api/owner/challenge', {
    method: 'POST', params: { action: 'challenge' }, body: { apiKey: KEY, serverId: SERVER },
  });

test('upstream 200 -> the key hash is added to today\'s bucket', async () => {
  const rec = recorder();
  __setActiveKeysRedisForTest(rec.client);
  upstream(200, { token: 't' });
  const r = await call();
  await flush();
  assert.equal(r.status, 200);
  assert.deepEqual(rec.writes, [[bucketKey(dayStamp(new Date())), keyId(KEY)]]);
  assert.ok(!JSON.stringify(rec.writes).includes(KEY), 'raw key must not reach Redis');
});

test('upstream 403 (authenticated, not the owner) still counts as activity', async () => {
  const rec = recorder();
  __setActiveKeysRedisForTest(rec.client);
  upstream(403, { error: 'no ownership grant' });
  const r = await call();
  await flush();
  assert.equal(r.status, 403);
  assert.equal(rec.writes.length, 1);
});

test('upstream 401 -> nothing recorded (the key was not accepted)', async () => {
  const rec = recorder();
  __setActiveKeysRedisForTest(rec.client);
  upstream(401, { error: 'unauthorized' });
  const r = await call();
  await flush();
  assert.equal(r.status, 401);
  assert.equal(rec.writes.length, 0);
});

test('upstream 5xx -> nothing recorded', async () => {
  const rec = recorder();
  __setActiveKeysRedisForTest(rec.client);
  upstream(500);
  const r = await call();
  await flush();
  assert.equal(r.status, 502);
  assert.equal(rec.writes.length, 0);
});

test('fail-open: Upstash rejects -> same 200 and body as with no counter', async () => {
  upstream(200, { token: 't' });
  const baseline = await call();
  __setActiveKeysRedisForTest(recorder(() => Promise.reject(new Error('ECONNRESET'))).client);
  const r = await call();
  await flush();
  assert.equal(r.status, baseline.status);
  assert.equal(r.text, baseline.text);
});

test('fail-open: pipeline() throws synchronously -> request unaffected', async () => {
  __setActiveKeysRedisForTest({ pipeline() { throw new Error('sync boom'); } });
  upstream(200, { token: 't' });
  const r = await call();
  await flush();
  assert.equal(r.status, 200);
});

test('fail-open: a hung Upstash does not delay the response', async () => {
  __setActiveKeysRedisForTest(recorder(() => new Promise<unknown[]>(() => {})).client);
  __setActiveKeysWriteTimeoutForTest(5_000);
  upstream(200, { token: 't' });
  const t0 = Date.now();
  const r = await call();
  const ms = Date.now() - t0;
  assert.equal(r.status, 200);
  // The write would hang for 5s; the response must not wait for it.
  assert.ok(ms < 1_000, `response took ${ms}ms with a hung counter`);
});
