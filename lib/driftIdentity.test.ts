import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Redis } from '@upstash/redis';
import {
  issueIdentity,
  verifyToken,
  revokeIdentity,
  authedInstallSet,
  sha256hex,
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

afterEach(() => {
  __setDriftIdentityRedisForTest(undefined);
});

test('issueIdentity returns token and stores token_sha256 (never raw token)', async () => {
  const { client, store, calls } = mockRedis();
  __setDriftIdentityRedisForTest(client);

  const res = await issueIdentity(INSTALL_A);
  assert.ok(res?.token);
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
  const { token } = (await issueIdentity(INSTALL_A))!;

  assert.equal(await verifyToken(INSTALL_A, token), true);
  assert.equal(await verifyToken(INSTALL_A, '0'.repeat(64)), false);
  assert.equal(await verifyToken(INSTALL_B, token), false);
});

test('revokeIdentity flips status only with correct token', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const { token } = (await issueIdentity(INSTALL_A))!;

  assert.equal(await revokeIdentity(INSTALL_A, 'wrong'), false);
  assert.equal(store.hashes.get(`drift:identity:${INSTALL_A}`)?.status, 'active');

  assert.equal(await revokeIdentity(INSTALL_A, token), true);
  assert.equal(store.hashes.get(`drift:identity:${INSTALL_A}`)?.status, 'revoked');
  assert.equal(await verifyToken(INSTALL_A, token), false);
});

test('re-register overwrites token_sha256; old token no longer verifies', async () => {
  const { client } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const first = (await issueIdentity(INSTALL_A))!;
  const second = (await issueIdentity(INSTALL_A))!;

  assert.notEqual(first.token, second.token);
  assert.equal(await verifyToken(INSTALL_A, first.token), false);
  assert.equal(await verifyToken(INSTALL_A, second.token), true);
});

test('authedInstallSet returns only install_id matching the shared token', async () => {
  const { client } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const a = (await issueIdentity(INSTALL_A))!;
  const b = (await issueIdentity(INSTALL_B))!;

  const withA = await authedInstallSet([INSTALL_A, INSTALL_B], a.token);
  assert.deepEqual([...withA], [INSTALL_A]);

  const withB = await authedInstallSet([INSTALL_A, INSTALL_B], b.token);
  assert.deepEqual([...withB], [INSTALL_B]);
});

test('fail-open: Redis null never throws', async () => {
  __setDriftIdentityRedisForTest(null);
  assert.equal(await issueIdentity(INSTALL_A), null);
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
