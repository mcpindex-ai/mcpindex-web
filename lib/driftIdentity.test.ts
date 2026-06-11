import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Redis } from '@upstash/redis';
import {
  issueIdentity,
  verifyToken,
  revokeIdentity,
  authedInstallSet,
  driftIdentityEnabled,
  sha256hex,
  MAX_AUTHED_VERIFY_PER_BATCH,
  __setDriftIdentityRedisForTest,
} from './driftIdentity';

const INSTALL_A = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const INSTALL_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

type Store = {
  hashes: Map<string, Record<string, string>>;
  sets: Map<string, Set<string>>;
};

function mockRedis(): { client: Redis; store: Store; calls: { method: string; args: unknown[] }[] } {
  const store: Store = { hashes: new Map(), sets: new Map() };
  const calls: { method: string; args: unknown[] }[] = [];

  const client = {
    async hset(key: string, fields: Record<string, string>) {
      calls.push({ method: 'hset', args: [key, fields] });
      const cur = store.hashes.get(key) ?? {};
      store.hashes.set(key, { ...cur, ...fields });
    },
    async hgetall<T extends Record<string, string>>(key: string): Promise<T | null> {
      calls.push({ method: 'hgetall', args: [key] });
      const row = store.hashes.get(key);
      return row ? ({ ...row } as T) : null;
    },
    async sadd(key: string, ...members: string[]) {
      calls.push({ method: 'sadd', args: [key, ...members] });
      const set = store.sets.get(key) ?? new Set<string>();
      for (const m of members) set.add(m);
      store.sets.set(key, set);
    },
  } as unknown as Redis;

  return { client, store, calls };
}

const savedDriftIdentity = process.env.DRIFT_IDENTITY;

afterEach(() => {
  __setDriftIdentityRedisForTest(undefined);
  if (savedDriftIdentity === undefined) delete process.env.DRIFT_IDENTITY;
  else process.env.DRIFT_IDENTITY = savedDriftIdentity;
});

test('issueIdentity returns token and stores token_sha256 (never raw token)', async () => {
  const { client, store, calls } = mockRedis();
  __setDriftIdentityRedisForTest(client);

  const res = await issueIdentity(INSTALL_A);
  assert.ok(res && 'ok' in res && res.ok);
  assert.match(res.token, /^[0-9a-f]{64}$/);

  const hset = calls.find((c) => c.method === 'hset');
  assert.ok(hset);
  const fields = hset.args[1] as Record<string, string>;
  assert.equal(fields.status, 'active');
  assert.equal(fields.cost_class, 'none');
  assert.notEqual(fields.token_sha256, res.token);
  assert.equal(await sha256hex(res.token), fields.token_sha256);

  const row = store.hashes.get(`drift:identity:${INSTALL_A}`);
  assert.ok(row);
  assert.ok(!JSON.stringify(row).includes(res.token));

  const sadd = calls.find((c) => c.method === 'sadd');
  assert.deepEqual(sadd?.args, ['drift:identities', INSTALL_A]);
});

test('verifyToken accepts issued token and rejects wrong token', async () => {
  const { client } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const res = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in res ? res.token : '';

  assert.equal(await verifyToken(INSTALL_A, token), true);
  assert.equal(await verifyToken(INSTALL_A, '0'.repeat(64)), false);
  assert.equal(await verifyToken(INSTALL_B, token), false);
});

test('revokeIdentity flips status only with correct token', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const res = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in res ? res.token : '';

  assert.equal(await revokeIdentity(INSTALL_A, 'wrong'), false);
  assert.equal(store.hashes.get(`drift:identity:${INSTALL_A}`)?.status, 'active');

  assert.equal(await revokeIdentity(INSTALL_A, token), true);
  assert.equal(store.hashes.get(`drift:identity:${INSTALL_A}`)?.status, 'revoked');
  assert.equal(await verifyToken(INSTALL_A, token), false);
});

test('re-register without current token returns conflict; hash and created_at unchanged', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const first = (await issueIdentity(INSTALL_A))!;
  const firstToken = 'ok' in first ? first.token : '';
  const rowBefore = store.hashes.get(`drift:identity:${INSTALL_A}`)!;
  const hashBefore = rowBefore.token_sha256;
  const createdBefore = rowBefore.created_at;

  const second = await issueIdentity(INSTALL_A);
  assert.deepEqual(second, { conflict: true });

  const rowAfter = store.hashes.get(`drift:identity:${INSTALL_A}`)!;
  assert.equal(rowAfter.token_sha256, hashBefore);
  assert.equal(rowAfter.created_at, createdBefore);
  assert.equal(await verifyToken(INSTALL_A, firstToken), true);
});

test('re-register with correct token rotates and preserves created_at', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const first = (await issueIdentity(INSTALL_A))!;
  const firstToken = 'ok' in first ? first.token : '';
  const createdBefore = store.hashes.get(`drift:identity:${INSTALL_A}`)!.created_at;

  const second = await issueIdentity(INSTALL_A, firstToken);
  assert.ok(second && 'ok' in second && second.ok);
  assert.notEqual(firstToken, second.token);

  const rowAfter = store.hashes.get(`drift:identity:${INSTALL_A}`)!;
  assert.equal(rowAfter.created_at, createdBefore);
  assert.equal(await verifyToken(INSTALL_A, firstToken), false);
  assert.equal(await verifyToken(INSTALL_A, second.token), true);
});

test('re-register of revoked install_id returns conflict', async () => {
  const { client } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const first = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in first ? first.token : '';
  assert.equal(await revokeIdentity(INSTALL_A, token), true);

  const again = await issueIdentity(INSTALL_A, token);
  assert.deepEqual(again, { conflict: true });
});

test('authedInstallSet returns only install_id matching the shared token', async () => {
  const { client } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const a = (await issueIdentity(INSTALL_A))!;
  const b = (await issueIdentity(INSTALL_B))!;
  const tokenA = 'ok' in a ? a.token : '';
  const tokenB = 'ok' in b ? b.token : '';

  const withA = await authedInstallSet([INSTALL_A, INSTALL_B], tokenA);
  assert.deepEqual([...withA], [INSTALL_A]);

  const withB = await authedInstallSet([INSTALL_A, INSTALL_B], tokenB);
  assert.deepEqual([...withB], [INSTALL_B]);
});

test('authedInstallSet verifies at most MAX_AUTHED_VERIFY_PER_BATCH distinct ids', async () => {
  const { client, calls } = mockRedis();
  __setDriftIdentityRedisForTest(client);

  const ids: string[] = [];
  for (let i = 0; i < MAX_AUTHED_VERIFY_PER_BATCH + 5; i++) {
    ids.push(i.toString(16).padStart(32, '0'));
  }

  const first = await issueIdentity(ids[0]);
  const token = first && 'ok' in first ? first.token : '';
  for (let i = 1; i < ids.length; i++) {
    await issueIdentity(ids[i]);
  }

  calls.length = 0;
  const authed = await authedInstallSet(ids, token);
  const verifyHgetalls = calls.filter((c) => c.method === 'hgetall');
  assert.equal(verifyHgetalls.length, MAX_AUTHED_VERIFY_PER_BATCH);
  assert.equal(authed.size, 1);
  assert.ok(authed.has(ids[0]));
  for (const id of ids.slice(MAX_AUTHED_VERIFY_PER_BATCH)) {
    assert.ok(!authed.has(id));
  }
});

test('fail-open: Redis null returns unavailable for issueIdentity', async () => {
  __setDriftIdentityRedisForTest(null);
  assert.deepEqual(await issueIdentity(INSTALL_A), { unavailable: true });
  assert.equal(await verifyToken(INSTALL_A, 'x'), false);
  assert.equal(await revokeIdentity(INSTALL_A, 'x'), false);
  assert.deepEqual([...(await authedInstallSet([INSTALL_A], 'x'))], []);
});

test('sha256hex is deterministic', async () => {
  assert.equal(
    await sha256hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('driftIdentityEnabled is false when DRIFT_IDENTITY is unset', () => {
  delete process.env.DRIFT_IDENTITY;
  assert.equal(driftIdentityEnabled(), false);
});

test('driftIdentityEnabled is true only when DRIFT_IDENTITY is 1', () => {
  process.env.DRIFT_IDENTITY = '1';
  assert.equal(driftIdentityEnabled(), true);
  process.env.DRIFT_IDENTITY = '0';
  assert.equal(driftIdentityEnabled(), false);
});
