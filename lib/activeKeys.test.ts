import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ACTIVE_MIN_DAYS,
  ACTIVE_WINDOW_DAYS,
  BUCKET_TTL_SECONDS,
  activeKeysOn,
  bucketKey,
  countActive,
  dayStamp,
  keyId,
  recordActiveKey,
  upstreamAuthenticated,
  windowStamps,
  __setActiveKeysRedisForTest,
  __setActiveKeysWriteTimeoutForTest,
  type ActiveKeysRedis,
} from './activeKeys';

afterEach(() => {
  // null, not undefined: undefined would resolve from env and could reach live Upstash.
  __setActiveKeysRedisForTest(null);
  __setActiveKeysWriteTimeoutForTest(undefined);
  delete process.env.ACTIVE_KEYS_DISABLED;
});

const RAW = 'mcpk_' + 'x'.repeat(43);

/** In-memory Upstash fake that actually applies SADD/EXPIRE/SMEMBERS. */
function fakeRedis(opts: { execImpl?: () => Promise<unknown[]> } = {}) {
  const sets = new Map<string, Set<string>>();
  const ttls = new Map<string, number>();
  let pipelines = 0;
  let commands = 0;
  const client: ActiveKeysRedis = {
    pipeline() {
      pipelines++;
      const ops: (() => unknown)[] = [];
      const p = {
        sadd(k: string, m: string) {
          ops.push(() => {
            const s = sets.get(k) ?? new Set<string>();
            const had = s.has(m);
            s.add(m);
            sets.set(k, s);
            return had ? 0 : 1;
          });
          return p;
        },
        expire(k: string, sec: number) { ops.push(() => { ttls.set(k, sec); return 1; }); return p; },
        smembers(k: string) { ops.push(() => [...(sets.get(k) ?? [])]); return p; },
        exec() {
          commands += ops.length;
          if (opts.execImpl) return opts.execImpl();
          return Promise.resolve(ops.map((f) => f()));
        },
      };
      return p;
    },
  };
  return { client, sets, ttls, pipelines: () => pipelines, commands: () => commands };
}

const at = (iso: string) => new Date(iso);

// ---------------------------------------------------------------- hashing

test('keyId is sha256 hex of the raw key (matches Supabase api_keys.key_hash)', () => {
  const want = createHash('sha256').update(RAW, 'utf8').digest('hex');
  assert.equal(keyId(RAW), want);
  assert.match(keyId(RAW), /^[0-9a-f]{64}$/);
  assert.ok(!keyId(RAW).includes(RAW));
  assert.notEqual(keyId(RAW), keyId(RAW + 'y'));
});

test('the raw key never reaches Redis, only its hash', async () => {
  const f = fakeRedis();
  __setActiveKeysRedisForTest(f.client);
  await recordActiveKey(RAW, at('2026-10-12T10:00:00Z'));
  const all = JSON.stringify([...f.sets.entries()].map(([k, v]) => [k, [...v]]));
  assert.ok(!all.includes(RAW));
  assert.ok(all.includes(keyId(RAW)));
});

// ---------------------------------------------------------------- bucket math

test('dayStamp is the UTC day, not local', () => {
  assert.equal(dayStamp(at('2026-10-12T23:59:59.999Z')), '20261012');
  assert.equal(dayStamp(at('2026-10-13T00:00:00Z')), '20261013');
  // 2026-10-12 17:00 in Seattle is already 10-13 UTC
  assert.equal(dayStamp(at('2026-10-12T17:00:00-07:00')), '20261013');
});

test('windowStamps: 7 days ending on the date, inclusive, oldest first', () => {
  assert.deepEqual(windowStamps('2026-10-12'), [
    '20261006', '20261007', '20261008', '20261009', '20261010', '20261011', '20261012',
  ]);
  assert.equal(windowStamps('2026-10-12').length, ACTIVE_WINDOW_DAYS);
});

test('windowStamps crosses month and year boundaries and leap days', () => {
  assert.deepEqual(windowStamps('2027-01-02'), [
    '20261227', '20261228', '20261229', '20261230', '20261231', '20270101', '20270102',
  ]);
  assert.deepEqual(windowStamps('2028-03-01').slice(-3), ['20280228', '20280229', '20280301']);
});

test('windowStamps rejects malformed and impossible dates', () => {
  for (const d of ['2026-13-01', '2026-02-30', '20261012', '2026-10-1', '', 'today']) {
    assert.throws(() => windowStamps(d), /bad date/, d);
  }
});

test('retention covers the 7-day window plus a 30-day late-snapshot look-back', () => {
  assert.ok(BUCKET_TTL_SECONDS >= (ACTIVE_WINDOW_DAYS + 30) * 86_400);
  assert.equal(BUCKET_TTL_SECONDS, 40 * 86_400);
});

// ---------------------------------------------------------------- 2-of-7 definition

test('countActive: 2 distinct days qualifies, 1 does not', () => {
  assert.equal(ACTIVE_MIN_DAYS, 2);
  assert.equal(countActive([['a'], [], [], [], [], [], ['a']]), 1);
  assert.equal(countActive([['a'], [], [], [], [], [], []]), 0);
});

test('countActive: many calls on one day is still one day', () => {
  assert.equal(countActive([['a', 'a', 'a'], [], [], [], [], [], []]), 0);
});

test('countActive: mixed population', () => {
  const perDay = [['a', 'b'], ['a'], ['c'], [], ['d'], ['d', 'b'], ['e']];
  // a: 2 days, b: 2, c: 1, d: 2, e: 1
  assert.equal(countActive(perDay), 3);
});

test('activeKeysOn: a key on day 1 and day 7 of the window is active; day 0 falls outside', async () => {
  const f = fakeRedis();
  __setActiveKeysRedisForTest(f.client);
  // key A: 10-06 and 10-12, both inside the window ending 10-12
  await recordActiveKey('mcpk_A_aaaaaaaa', at('2026-10-06T01:00:00Z'));
  await recordActiveKey('mcpk_A_aaaaaaaa', at('2026-10-12T23:00:00Z'));
  // key B: 10-05 (outside) and 10-12 (inside) -> one day in window -> not active
  await recordActiveKey('mcpk_B_bbbbbbbb', at('2026-10-05T12:00:00Z'));
  await recordActiveKey('mcpk_B_bbbbbbbb', at('2026-10-12T12:00:00Z'));
  // key C: twice on the same day -> not active
  await recordActiveKey('mcpk_C_cccccccc', at('2026-10-10T01:00:00Z'));
  await recordActiveKey('mcpk_C_cccccccc', at('2026-10-10T22:00:00Z'));

  const r = await activeKeysOn('2026-10-12', f.client);
  assert.equal(r.active_keys, 1);
  assert.equal(r.distinct_keys_seen, 3);
  assert.equal(r.window_start, '2026-10-06');
  assert.equal(r.window_end, '2026-10-12');
  assert.equal(r.days_with_data, 3); // 10-06, 10-10, 10-12
  assert.equal(r.window_days, 7);
  assert.equal(r.min_days, 2);
  // the report carries counts only, never a key id
  assert.ok(!JSON.stringify(r).includes(keyId('mcpk_A_aaaaaaaa')));

  // one day later key A's 10-06 mark drops out of the window
  const next = await activeKeysOn('2026-10-13', f.client);
  assert.equal(next.active_keys, 0);
});

test('activeKeysOn: numbers from a deserializing client are normalized to strings', async () => {
  const client: ActiveKeysRedis = {
    pipeline() {
      const p = {
        sadd: () => p, expire: () => p, smembers: () => p,
        exec: () => Promise.resolve([[123], ['123'], [], [], [], [], []]),
      };
      return p;
    },
  };
  const r = await activeKeysOn('2026-10-12', client);
  assert.equal(r.active_keys, 1);
});

test('activeKeysOn: an absent client or malformed result throws, never reads as zero', async () => {
  await assert.rejects(() => activeKeysOn('2026-10-12', null), /unread/);
  const short: ActiveKeysRedis = {
    pipeline() {
      const p = { sadd: () => p, expire: () => p, smembers: () => p, exec: () => Promise.resolve([[]]) };
      return p;
    },
  };
  await assert.rejects(() => activeKeysOn('2026-10-12', short), /malformed/);
});

// ---------------------------------------------------------------- write shape and cost

test('a first write is one pipeline: SADD + EXPIRE with the 40d TTL', async () => {
  const f = fakeRedis();
  __setActiveKeysRedisForTest(f.client);
  await recordActiveKey(RAW, at('2026-10-12T10:00:00Z'));
  assert.equal(f.pipelines(), 1);
  assert.equal(f.commands(), 2);
  assert.deepEqual([...f.sets.get(bucketKey('20261012'))!], [keyId(RAW)]);
  assert.equal(f.ttls.get(bucketKey('20261012')), BUCKET_TTL_SECONDS);
});

test('repeat calls for the same key and day cost zero commands in the same isolate', async () => {
  const f = fakeRedis();
  __setActiveKeysRedisForTest(f.client);
  for (let i = 0; i < 50; i++) await recordActiveKey(RAW, at('2026-10-12T10:00:00Z'));
  assert.equal(f.commands(), 2);
  await recordActiveKey(RAW, at('2026-10-13T00:00:01Z')); // new day writes again
  assert.equal(f.commands(), 4);
});

test('a failed write is not memoized, so the next call retries it', async () => {
  let fail = true;
  const f = fakeRedis({
    execImpl: () => (fail ? Promise.reject(new Error('boom')) : Promise.resolve([1, 1])),
  });
  __setActiveKeysRedisForTest(f.client);
  await recordActiveKey(RAW, at('2026-10-12T10:00:00Z'));
  fail = false;
  await recordActiveKey(RAW, at('2026-10-12T10:05:00Z'));
  assert.equal(f.pipelines(), 2);
});

test('kill switch ACTIVE_KEYS_DISABLED=1 writes nothing', async () => {
  const f = fakeRedis();
  __setActiveKeysRedisForTest(f.client);
  process.env.ACTIVE_KEYS_DISABLED = '1';
  await recordActiveKey(RAW, at('2026-10-12T10:00:00Z'));
  assert.equal(f.pipelines(), 0);
});

// ---------------------------------------------------------------- fail-open

test('fail-open: exec rejects -> recordActiveKey resolves', async () => {
  __setActiveKeysRedisForTest(fakeRedis({ execImpl: () => Promise.reject(new Error('ECONNRESET')) }).client);
  await assert.doesNotReject(() => recordActiveKey(RAW));
});

test('fail-open: pipeline() throws synchronously -> recordActiveKey resolves', async () => {
  __setActiveKeysRedisForTest({ pipeline() { throw new Error('sync boom'); } });
  await assert.doesNotReject(() => recordActiveKey(RAW));
});

test('fail-open: a hung Upstash call is cut off at the write timeout', async () => {
  __setActiveKeysRedisForTest(fakeRedis({ execImpl: () => new Promise<unknown[]>(() => {}) }).client);
  __setActiveKeysWriteTimeoutForTest(50);
  const t0 = Date.now();
  await recordActiveKey(RAW);
  const ms = Date.now() - t0;
  assert.ok(ms < 1_000, `took ${ms}ms`);
});

test('no client configured -> no-op', async () => {
  __setActiveKeysRedisForTest(null);
  await assert.doesNotReject(() => recordActiveKey(RAW));
});

// ---------------------------------------------------------------- what counts as authenticated

test('upstreamAuthenticated: 2xx and post-auth 4xx count; 401 and 404 do not', () => {
  for (const s of [200, 201, 204, 400, 403, 409, 413, 429]) assert.equal(upstreamAuthenticated(s), true, String(s));
  for (const s of [401, 404, 301, 302, 500, 502, 504, 100]) assert.equal(upstreamAuthenticated(s), false, String(s));
});
