import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Redis } from '@upstash/redis';
import {
  issueIdentity,
  sha256hex,
  __setDriftIdentityRedisForTest,
} from './driftIdentity';
import {
  startUpgrade,
  bindGithub,
  oauthEnabled,
  type OAuthTransport,
  __setDriftOAuthRedisForTest,
} from './driftOAuth';

const INSTALL_A = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const INSTALL_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const GH_ID = '12345';
const ACCESS_TOKEN = 'gho_test_access_token_secret';
const PEPPER = 'test-pepper';

type Store = {
  hashes: Map<string, Record<string, string>>;
  sets: Map<string, Set<string>>;
  strings: Map<string, string>;
  ttl: Map<string, number>;
};

function mockRedis(): { client: Redis; store: Store } {
  const store: Store = {
    hashes: new Map(),
    sets: new Map(),
    strings: new Map(),
    ttl: new Map(),
  };

  const client = {
    async hset(key: string, fields: Record<string, string>) {
      const cur = store.hashes.get(key) ?? {};
      store.hashes.set(key, { ...cur, ...fields });
    },
    async hgetall<T extends Record<string, string>>(key: string): Promise<T | null> {
      const row = store.hashes.get(key);
      return row ? ({ ...row } as T) : null;
    },
    async sadd(key: string, ...members: string[]) {
      const set = store.sets.get(key) ?? new Set<string>();
      for (const m of members) set.add(m);
      store.sets.set(key, set);
    },
    async set(key: string, value: string, opts?: { nx?: boolean; ex?: number }) {
      if (opts?.nx && store.strings.has(key)) return null;
      store.strings.set(key, value);
      if (opts?.ex) store.ttl.set(key, opts.ex);
      return 'OK';
    },
    async get<T = string>(key: string): Promise<T | null> {
      return (store.strings.get(key) as T) ?? null;
    },
    async del(key: string) {
      store.strings.delete(key);
      store.ttl.delete(key);
      return 1;
    },
    async incr(key: string) {
      const cur = Number(store.strings.get(key) ?? '0');
      const next = cur + 1;
      store.strings.set(key, String(next));
      return next;
    },
    async expire() {
      return 1;
    },
  } as unknown as Redis;

  return { client, store };
}

function fakeTransport(ghId = GH_ID, token = ACCESS_TOKEN): OAuthTransport {
  return {
    async exchangeCode(code: string) {
      return code === 'valid-code' ? token : null;
    },
    async fetchUserId(accessToken: string) {
      return accessToken === token ? ghId : null;
    },
  };
}

function allStoredValues(store: Store): string {
  const parts: string[] = [];
  for (const row of store.hashes.values()) {
    parts.push(JSON.stringify(row));
  }
  for (const v of store.strings.values()) {
    parts.push(v);
  }
  return parts.join('|');
}

const savedOAuth = process.env.DRIFT_OAUTH_UPGRADE;
const savedClientId = process.env.DRIFT_OAUTH_CLIENT_ID;
const savedRedirect = process.env.DRIFT_OAUTH_REDIRECT_URI;
const savedPepper = process.env.DRIFT_OAUTH_PEPPER;

afterEach(() => {
  __setDriftIdentityRedisForTest(undefined);
  __setDriftOAuthRedisForTest(undefined);
  if (savedOAuth === undefined) delete process.env.DRIFT_OAUTH_UPGRADE;
  else process.env.DRIFT_OAUTH_UPGRADE = savedOAuth;
  if (savedClientId === undefined) delete process.env.DRIFT_OAUTH_CLIENT_ID;
  else process.env.DRIFT_OAUTH_CLIENT_ID = savedClientId;
  if (savedRedirect === undefined) delete process.env.DRIFT_OAUTH_REDIRECT_URI;
  else process.env.DRIFT_OAUTH_REDIRECT_URI = savedRedirect;
  if (savedPepper === undefined) delete process.env.DRIFT_OAUTH_PEPPER;
  else process.env.DRIFT_OAUTH_PEPPER = savedPepper;
});

test('startUpgrade requires valid token', async () => {
  const { client } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';

  assert.deepEqual(await startUpgrade(INSTALL_A, 'wrong'), { error: 'unauthorized' });
  assert.deepEqual(await startUpgrade(INSTALL_A, ''), { error: 'unauthorized' });

  const res = await startUpgrade(INSTALL_A, token);
  assert.ok(res && 'url' in res);
  const url = new URL(res.url);
  assert.equal(url.hostname, 'github.com');
  assert.equal(url.pathname, '/login/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'cid');
  assert.equal(url.searchParams.get('scope'), 'read:user');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/callback');
  const state = url.searchParams.get('state');
  assert.ok(state && /^[0-9a-f]{64}$/.test(state));
});

test('startUpgrade stores state with TTL', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';
  const res = await startUpgrade(INSTALL_A, token);
  assert.ok(res && 'url' in res);

  const state = new URL(res.url).searchParams.get('state')!;
  assert.equal(store.strings.get(`oauth:state:${state}`), INSTALL_A);
  assert.equal(store.ttl.get(`oauth:state:${state}`), 600);
});

test('bindGithub happy path sets cost_class and github_hash, consumes state', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_PEPPER = PEPPER;

  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';
  const start = await startUpgrade(INSTALL_A, token);
  assert.ok(start && 'url' in start);
  const state = new URL(start.url).searchParams.get('state')!;

  const expectedHash = await sha256hex(GH_ID + PEPPER);
  const result = await bindGithub(state, 'valid-code', fakeTransport());
  assert.deepEqual(result, { ok: true, cost_class: 'github' });

  const row = store.hashes.get(`drift:identity:${INSTALL_A}`);
  assert.equal(row?.cost_class, 'github');
  assert.equal(row?.github_hash, expectedHash);
  assert.equal(store.strings.get(`oauth:state:${state}`), undefined);

  const replay = await bindGithub(state, 'valid-code', fakeTransport());
  assert.deepEqual(replay, { error: 'invalid_state' });
});

test('bindGithub never persists raw token, gh id, or username', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_PEPPER = PEPPER;
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';
  const start = await startUpgrade(INSTALL_A, token);
  const state = new URL(start && 'url' in start ? start.url : 'http://x').searchParams.get('state')!;

  await bindGithub(state, 'valid-code', fakeTransport());

  const stored = allStoredValues(store);
  assert.ok(!stored.includes(ACCESS_TOKEN));
  assert.ok(!stored.includes(GH_ID));
  assert.ok(!stored.includes('valid-code'));

  const row = store.hashes.get(`drift:identity:${INSTALL_A}`);
  assert.notEqual(row?.github_hash, GH_ID);
  assert.notEqual(row?.github_hash, ACCESS_TOKEN);
});

test('one-per-GH: second install binding same github_hash returns already_bound', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_PEPPER = PEPPER;
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  const a = (await issueIdentity(INSTALL_A))!;
  const b = (await issueIdentity(INSTALL_B))!;
  const tokenA = 'ok' in a ? a.token : '';
  const tokenB = 'ok' in b ? b.token : '';

  const startA = await startUpgrade(INSTALL_A, tokenA);
  const stateA = new URL(startA && 'url' in startA ? startA.url : 'http://x').searchParams.get('state')!;
  assert.deepEqual(await bindGithub(stateA, 'valid-code', fakeTransport()), {
    ok: true,
    cost_class: 'github',
  });

  const startB = await startUpgrade(INSTALL_B, tokenB);
  const stateB = new URL(startB && 'url' in startB ? startB.url : 'http://x').searchParams.get('state')!;
  const second = await bindGithub(stateB, 'valid-code', fakeTransport());
  assert.deepEqual(second, { error: 'already_bound' });

  assert.equal(store.hashes.get(`drift:identity:${INSTALL_B}`)?.cost_class, 'none');
});

test('bindGithub only touches active identity', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_PEPPER = PEPPER;
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  await issueIdentity(INSTALL_A);
  store.hashes.set(`drift:identity:${INSTALL_A}`, {
    ...store.hashes.get(`drift:identity:${INSTALL_A}`)!,
    status: 'revoked',
  });

  const state = 'a'.repeat(64);
  store.strings.set(`oauth:state:${state}`, INSTALL_A);

  const expectedHash = await sha256hex(GH_ID + PEPPER);
  const result = await bindGithub(state, 'valid-code', fakeTransport());
  assert.deepEqual(result, { error: 'exchange_failed' });
  assert.notEqual(store.hashes.get(`drift:identity:${INSTALL_A}`)?.cost_class, 'github');
  assert.equal(store.strings.get(`oauth:gh:${expectedHash}`), undefined);
});

test('bindGithub re-bind same install and same GH is idempotent', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_PEPPER = PEPPER;
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';
  const start = await startUpgrade(INSTALL_A, token);
  const state = new URL(start && 'url' in start ? start.url : 'http://x').searchParams.get('state')!;
  const expectedHash = await sha256hex(GH_ID + PEPPER);

  assert.deepEqual(await bindGithub(state, 'valid-code', fakeTransport()), {
    ok: true,
    cost_class: 'github',
  });

  const state2 = 'c'.repeat(64);
  store.strings.set(`oauth:state:${state2}`, INSTALL_A);
  assert.deepEqual(await bindGithub(state2, 'valid-code', fakeTransport()), {
    ok: true,
    cost_class: 'github',
  });

  const row = store.hashes.get(`drift:identity:${INSTALL_A}`);
  assert.equal(row?.github_hash, expectedHash);
  assert.equal(store.strings.get(`oauth:gh:${expectedHash}`), INSTALL_A);
});

test('bindGithub rejects re-bind to different GH without overwriting', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  process.env.DRIFT_OAUTH_PEPPER = PEPPER;
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';
  const start = await startUpgrade(INSTALL_A, token);
  const state = new URL(start && 'url' in start ? start.url : 'http://x').searchParams.get('state')!;
  const originalHash = await sha256hex(GH_ID + PEPPER);

  assert.deepEqual(await bindGithub(state, 'valid-code', fakeTransport()), {
    ok: true,
    cost_class: 'github',
  });

  const newGhId = '99999';
  const newHash = await sha256hex(newGhId + PEPPER);
  const state2 = 'd'.repeat(64);
  store.strings.set(`oauth:state:${state2}`, INSTALL_A);

  const result = await bindGithub(state2, 'valid-code', fakeTransport(newGhId));
  assert.deepEqual(result, { error: 'already_bound' });
  assert.equal(store.hashes.get(`drift:identity:${INSTALL_A}`)?.github_hash, originalHash);
  assert.equal(store.strings.get(`oauth:gh:${newHash}`), undefined);
});

test('bindGithub returns unavailable when DRIFT_OAUTH_PEPPER is empty', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);
  delete process.env.DRIFT_OAUTH_PEPPER;
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_REDIRECT_URI = 'https://example.com/callback';

  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';
  const start = await startUpgrade(INSTALL_A, token);
  const state = new URL(start && 'url' in start ? start.url : 'http://x').searchParams.get('state')!;

  const result = await bindGithub(state, 'valid-code', fakeTransport());
  assert.deepEqual(result, { unavailable: true });
  assert.equal(store.hashes.get(`drift:identity:${INSTALL_A}`)?.cost_class, 'none');
  const expectedWeakHash = await sha256hex(GH_ID);
  assert.equal(store.strings.get(`oauth:gh:${expectedWeakHash}`), undefined);
});

test('fail-open: Redis null returns unavailable without throwing', async () => {
  const { client } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  const issued = (await issueIdentity(INSTALL_A))!;
  const token = 'ok' in issued ? issued.token : '';

  __setDriftOAuthRedisForTest(null);
  assert.deepEqual(await startUpgrade(INSTALL_A, token), { unavailable: true });
  assert.deepEqual(await bindGithub('a'.repeat(64), 'code', fakeTransport()), {
    unavailable: true,
  });
});

test('fail-open: transport null returns exchange_failed without throwing', async () => {
  const { client, store } = mockRedis();
  __setDriftIdentityRedisForTest(client);
  __setDriftOAuthRedisForTest(client);

  await issueIdentity(INSTALL_A);
  const state = 'b'.repeat(64);
  store.strings.set(`oauth:state:${state}`, INSTALL_A);

  const nullTransport: OAuthTransport = {
    exchangeCode: async () => null,
    fetchUserId: async () => null,
  };
  assert.deepEqual(await bindGithub(state, 'code', nullTransport), { error: 'exchange_failed' });
});

test('oauthEnabled is false when DRIFT_OAUTH_UPGRADE is unset', () => {
  delete process.env.DRIFT_OAUTH_UPGRADE;
  assert.equal(oauthEnabled(), false);
});

test('oauthEnabled is true only when DRIFT_OAUTH_UPGRADE is 1', () => {
  process.env.DRIFT_OAUTH_UPGRADE = '1';
  assert.equal(oauthEnabled(), true);
  process.env.DRIFT_OAUTH_UPGRADE = '0';
  assert.equal(oauthEnabled(), false);
});
