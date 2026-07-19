// Unit tests for the fleet drift-query lookup (M3, read side). Pins the fail-OPEN contract
// (no cache => `drifted: null`, never a false `false`) and the fp-shape gate. Run with
// `npm test` (tsx + node:test). Live Redis hits are not exercised here (no creds in CI).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Redis } from '@upstash/redis';
import {
  lookupCorroborated,
  metaToResult,
  metaToResultInstalls,
  FP_RE,
  MAX_FPS,
  __setDriftQueryRedisForTest,
  type DriftAny,
} from './driftQuery';

const FP = '0b4796d16feb3912c0db0824c39e9b70'; // 32 hex
const FP_INSTALLS = '11111111111111111111111111111111';
const FP_MISS = '22222222222222222222222222222222';
const FP_CRAWL2 = '33333333333333333333333333333333';

type Store = {
  hashes: Map<string, Record<string, unknown>>;
  sets: Map<string, Set<string>>;
};

function mockRedis(): { client: Redis; store: Store; calls: { method: string; args: unknown[] }[] } {
  const store: Store = { hashes: new Map(), sets: new Map() };
  const calls: { method: string; args: unknown[] }[] = [];

  const client = {
    async sismember(key: string, member: string): Promise<0 | 1> {
      calls.push({ method: 'sismember', args: [key, member] });
      const set = store.sets.get(key);
      return set?.has(member) ? 1 : 0;
    },
    async hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null> {
      calls.push({ method: 'hgetall', args: [key] });
      const row = store.hashes.get(key);
      return row ? ({ ...row } as T) : null;
    },
  } as unknown as Redis;

  return { client, store, calls };
}

function seedCrawlHit(store: Store, fp: string, meta?: Record<string, unknown>) {
  const set = store.sets.get('drift:corroborated') ?? new Set<string>();
  set.add(fp);
  store.sets.set('drift:corroborated', set);
  if (meta) store.hashes.set(`drift:corr:meta:${fp}`, meta);
}

function seedInstallsHit(store: Store, fp: string, meta?: Record<string, unknown>) {
  const set = store.sets.get('drift:corroborated:installs') ?? new Set<string>();
  set.add(fp);
  store.sets.set('drift:corroborated:installs', set);
  if (meta) store.hashes.set(`drift:corr:meta:installs:${fp}`, meta);
}

afterEach(() => {
  __setDriftQueryRedisForTest(undefined);
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.DRIFT_DARK_CORROBORATION;
});

test('FP_RE accepts exactly 32 lowercase hex, rejects everything else', () => {
  assert.ok(FP_RE.test(FP));
  assert.equal(FP_RE.test(''), false);
  assert.equal(FP_RE.test('ZZ4796d16feb3912c0db0824c39e9b70'), false);
  assert.equal(FP_RE.test(FP + 'aa'), false); // too long
  assert.equal(FP_RE.test('0b4796d16feb3912c0db0824c39e9b7'), false); // 31
  assert.equal(FP_RE.test('https://internal.corp/secret'), false); // no raw strings
});

test('fail-open: with no Upstash configured, every fp resolves to drifted:null (unknown)', async () => {
  const res = await lookupCorroborated([FP, 'a'.repeat(32)]);
  const a = res[FP] as DriftAny;
  assert.deepEqual(a, { drifted: null });
  assert.deepEqual(res['a'.repeat(32)] as DriftAny, { drifted: null });
});

test('MAX_FPS batch cap is a sane bound', () => {
  assert.equal(MAX_FPS, 256);
});

test('metaToResult: change_kinds allowlist-parsed; missing meta -> drifted:true with []', () => {
  assert.deepEqual(metaToResult(null), {
    drifted: true,
    provenance: 'crawl',
    sources: 1,
    safety_relevant: false,
    last_seen: null,
    change_kinds: [],
  });
  const fromStr = metaToResult({ sources: '1', safety_relevant: '1', change_kinds: '["type-changed","bogus"]' });
  assert.deepEqual(fromStr, {
    drifted: true,
    provenance: 'crawl',
    sources: 1,
    safety_relevant: true,
    last_seen: null,
    change_kinds: ['type-changed'],
  });
  const fromArr = metaToResult({ sources: 1, change_kinds: ['removed-param', 'removed-param'] });
  assert.deepEqual((fromArr as Extract<DriftAny, { drifted: true }>).change_kinds, ['removed-param']);
});

test('crawl-member fp returns provenance:crawl and does not consult installs plane', async () => {
  const { client, store, calls } = mockRedis();
  __setDriftQueryRedisForTest(client);
  seedCrawlHit(store, FP, { sources: 2, safety_relevant: '1', last_seen: '2026-01-01' });
  // Decoy installs data that must be ignored for a crawl hit.
  seedInstallsHit(store, FP, { sources: 99, change_kinds: '["removed-param"]' });

  const res = await lookupCorroborated([FP]);
  assert.deepEqual(res[FP], {
    drifted: true,
    provenance: 'crawl',
    sources: 2,
    safety_relevant: true,
    last_seen: '2026-01-01',
    change_kinds: [],
  });
  assert.ok(calls.some((c) => c.method === 'sismember' && c.args[0] === 'drift:corroborated'));
  assert.equal(
    calls.filter((c) => c.method === 'sismember' && c.args[0] === 'drift:corroborated:installs').length,
    0,
  );
});

test('installs-only fp returns drifted:true provenance:installs with installs-meta sources', async () => {
  process.env.DRIFT_DARK_CORROBORATION = '1';
  const { client, store } = mockRedis();
  __setDriftQueryRedisForTest(client);
  seedInstallsHit(store, FP_INSTALLS, {
    sources: 3,
    safety_relevant: 1,
    last_seen: '2026-02-01',
    change_kinds: '["type-changed","bogus"]',
    provenance: 'installs',
  });

  const res = await lookupCorroborated([FP_INSTALLS]);
  assert.deepEqual(res[FP_INSTALLS], {
    drifted: true,
    provenance: 'installs',
    sources: 3,
    safety_relevant: true,
    last_seen: '2026-02-01',
    change_kinds: ['type-changed'],
  });
});

test('read-side gate: installs plane is NOT served when DRIFT_DARK_CORROBORATION is off', async () => {
  // Flag default OFF (afterEach deletes it). An fp present in the installs SET must resolve
  // drifted:false (the pre-installs-plane behavior) and the installs SET must NOT be consulted.
  const { client, store, calls } = mockRedis();
  __setDriftQueryRedisForTest(client);
  seedInstallsHit(store, FP_INSTALLS, { sources: 3, safety_relevant: 1, provenance: 'installs' });

  const res = await lookupCorroborated([FP_INSTALLS]);
  assert.deepEqual(res[FP_INSTALLS], { drifted: false });
  assert.equal(
    calls.filter((c) => c.method === 'sismember' && c.args[0] === 'drift:corroborated:installs').length,
    0,
  );
});

test('fp absent from both crawl and installs returns drifted:false', async () => {
  const { client } = mockRedis();
  __setDriftQueryRedisForTest(client);

  const res = await lookupCorroborated([FP_MISS]);
  assert.deepEqual(res[FP_MISS], { drifted: false });
});

test('Redis error on crawl pass yields drifted:null for all fps (fail-open)', async () => {
  const client = {
    async sismember() {
      throw new Error('redis down');
    },
    async hgetall() {
      return null;
    },
  } as unknown as Redis;
  __setDriftQueryRedisForTest(client);

  const res = await lookupCorroborated([FP, FP_INSTALLS, FP_MISS]);
  for (const fp of [FP, FP_INSTALLS, FP_MISS]) {
    assert.deepEqual(res[fp], { drifted: null });
  }
});

test('Redis error on installs pass yields drifted:null for all fps (fail-open)', async () => {
  process.env.DRIFT_DARK_CORROBORATION = '1';
  const { store } = mockRedis();
  let installPass = false;
  const client = {
    async sismember(key: string, member: string): Promise<0 | 1> {
      if (key === 'drift:corroborated:installs') {
        installPass = true;
        throw new Error('redis down on installs');
      }
      const set = store.sets.get(key);
      return set?.has(member) ? 1 : 0;
    },
    async hgetall() {
      return null;
    },
  } as unknown as Redis;
  __setDriftQueryRedisForTest(client);
  seedInstallsHit(store, FP_INSTALLS);

  const res = await lookupCorroborated([FP_MISS, FP_INSTALLS]);
  assert.ok(installPass);
  for (const fp of [FP_MISS, FP_INSTALLS]) {
    assert.deepEqual(res[fp], { drifted: null });
  }
});

test('batch mixing crawl hit, installs hit, and miss returns three distinct verdicts', async () => {
  process.env.DRIFT_DARK_CORROBORATION = '1';
  const { client, store } = mockRedis();
  __setDriftQueryRedisForTest(client);
  seedCrawlHit(store, FP, { sources: 1, safety_relevant: false });
  seedInstallsHit(store, FP_INSTALLS, { sources: 4, safety_relevant: true, change_kinds: ['removed-param'] });

  const res = await lookupCorroborated([FP, FP_INSTALLS, FP_MISS]);
  assert.deepEqual(res[FP], {
    drifted: true,
    provenance: 'crawl',
    sources: 1,
    safety_relevant: false,
    last_seen: null,
    change_kinds: [],
  });
  assert.deepEqual(res[FP_INSTALLS], {
    drifted: true,
    provenance: 'installs',
    sources: 4,
    safety_relevant: true,
    last_seen: null,
    change_kinds: ['removed-param'],
  });
  assert.deepEqual(res[FP_MISS], { drifted: false });
});

test('installs set member with missing meta returns drifted:true provenance:installs sources floor', async () => {
  process.env.DRIFT_DARK_CORROBORATION = '1';
  const { client, store } = mockRedis();
  __setDriftQueryRedisForTest(client);
  seedInstallsHit(store, FP_INSTALLS);

  const res = await lookupCorroborated([FP_INSTALLS]);
  assert.deepEqual(res[FP_INSTALLS], {
    drifted: true,
    provenance: 'installs',
    sources: 1,
    safety_relevant: false,
    last_seen: null,
    change_kinds: [],
  });
  assert.deepEqual(metaToResultInstalls(null), res[FP_INSTALLS]);
});

test('crawl set member with missing meta returns drifted:true provenance:crawl sources floor', async () => {
  const { client, store } = mockRedis();
  __setDriftQueryRedisForTest(client);
  seedCrawlHit(store, FP_CRAWL2);

  const res = await lookupCorroborated([FP_CRAWL2]);
  assert.deepEqual(res[FP_CRAWL2], {
    drifted: true,
    provenance: 'crawl',
    sources: 1,
    safety_relevant: false,
    last_seen: null,
    change_kinds: [],
  });
});

test('metaToResult: removal_scope allowlist-coerced, absent when invalid/missing', () => {
  const base = { sources: '1', safety_relevant: '1', change_kinds: '["tool-removed"]' };
  assert.equal(metaToResult({ ...base, removal_scope: 'toolset-replaced' }).drifted && (metaToResult({ ...base, removal_scope: 'toolset-replaced' }) as { removal_scope?: string }).removal_scope, 'toolset-replaced');
  assert.equal((metaToResult({ ...base, removal_scope: 'nonsense' }) as { removal_scope?: string }).removal_scope, undefined);
  assert.equal((metaToResult(base) as { removal_scope?: string }).removal_scope, undefined);
});
