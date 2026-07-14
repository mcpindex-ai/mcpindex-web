import { strict as assert } from 'node:assert';
import test, { afterEach } from 'node:test';
import {
  buildAuthorizeUrl,
  completeLogin,
  isLoopbackCallback,
  loginEnabled,
  startLogin,
  type IssueFn,
  type LoginTransport,
  type StateStore,
} from './loginOAuth';

const STATE = 'a'.repeat(64);
const CB = 'http://127.0.0.1:8765/cb';

function memStore(seed?: Record<string, string>): StateStore & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    data,
    async set(k, v) {
      data.set(k, v);
      return true;
    },
    async getdel(k) {
      const v = data.get(k) ?? null;
      data.delete(k);
      return v;
    },
  };
}

const goodTransport: LoginTransport = {
  async exchangeCode() {
    return 'gh-access-token';
  },
  async fetchUserId() {
    return '12345';
  },
};

const ENV_KEYS = [
  'DRIFT_OAUTH_CLIENT_ID',
  'DRIFT_OAUTH_CLIENT_SECRET',
  'MCPINDEX_LOGIN_CLIENT_ID',
  'MCPINDEX_LOGIN_CLIENT_SECRET',
  'MCPINDEX_LOGIN_REDIRECT_URI',
  'MCPINDEX_LOGIN_PEPPER',
  'DRIFT_OAUTH_PEPPER',
  'MCPINDEX_LOGIN_ENABLED',
];

// Isolate env between tests (some delete keys mid-test); prevents order-dependent flakes.
afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

function setEnv() {
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_CLIENT_SECRET = 'csec';
  process.env.MCPINDEX_LOGIN_REDIRECT_URI = 'https://mcpindex.ai/api/auth/login/callback';
  process.env.MCPINDEX_LOGIN_PEPPER = 'pep';
  process.env.MCPINDEX_LOGIN_ENABLED = '1';
}

test('loopback callback guard - only 127.0.0.1 / localhost allowed', () => {
  assert.ok(isLoopbackCallback('http://127.0.0.1:8765/cb'));
  assert.ok(isLoopbackCallback('http://localhost:5000'));
  assert.ok(!isLoopbackCallback('http://evil.example.com/cb'), 'external host rejected');
  assert.ok(!isLoopbackCallback('https://127.0.0.1/cb'), 'https/non-http rejected');
  assert.ok(!isLoopbackCallback('http://127.0.0.1.evil.com/cb'), 'suffix-host rejected');
  assert.ok(!isLoopbackCallback('http://[::1]/cb'), 'ipv6-literal not matched (kept simple)');
  assert.ok(!isLoopbackCallback('http://127.0.0.1/' + 'a'.repeat(130)), 'over-128-char callback rejected');
  assert.ok(!isLoopbackCallback('http://127.0.0.1\n'), 'trailing newline rejected (JS $ anchor hardening)');
  assert.ok(!isLoopbackCallback('http://127.0.0.1/cb\r\n'), 'CRLF rejected');
});

test('loginEnabled is true only for the exact string "1"', () => {
  process.env.MCPINDEX_LOGIN_ENABLED = '1';
  assert.ok(loginEnabled());
  process.env.MCPINDEX_LOGIN_ENABLED = 'true';
  assert.ok(!loginEnabled(), 'only "1" enables; "true" does not');
  delete process.env.MCPINDEX_LOGIN_ENABLED;
  assert.ok(!loginEnabled(), 'absent -> disabled');
});

test('start is inert (unavailable) when the feature flag is off, even with good config', async () => {
  setEnv();
  delete process.env.MCPINDEX_LOGIN_ENABLED;
  const store = memStore();
  const r = await startLogin(CB, store);
  assert.deepEqual(r, { error: 'unavailable' });
  assert.equal(store.data.size, 0, 'no state written when the feature is disabled');
});

test('start fails fast (no state burned) when the pepper is missing', async () => {
  setEnv();
  delete process.env.MCPINDEX_LOGIN_PEPPER;
  delete process.env.DRIFT_OAUTH_PEPPER;
  const store = memStore();
  const r = await startLogin(CB, store);
  assert.deepEqual(r, { error: 'unavailable' });
  assert.equal(store.data.size, 0, 'must not consume/write state on a misconfigured deploy');
});

test('start rejects a non-loopback callback (SSRF)', async () => {
  setEnv();
  const store = memStore();
  const r = await startLogin('http://attacker.example/cb', store);
  assert.deepEqual(r, { error: 'bad_callback' });
  assert.equal(store.data.size, 0, 'no state stored for a bad callback');
});

test('start stores state and returns a github authorize url', async () => {
  setEnv();
  const store = memStore();
  const r = await startLogin(CB, store);
  assert.ok('url' in r && r.url.startsWith('https://github.com/login/oauth/authorize?'));
  assert.equal(store.data.size, 1, 'one state stored');
});

test('complete: full happy path issues a key bound to the github id', async () => {
  setEnv();
  const store = memStore({ [`login:state:${STATE}`]: CB });
  const issued: string[] = [];
  const issue: IssueFn = async (ownerHash, opts) => {
    issued.push(`${ownerHash}:${opts.provider}`);
    return 'mcpk_minted';
  };
  const r = await completeLogin(STATE, 'code123', store, goodTransport, issue);
  assert.ok('ok' in r && r.ok, `expected ok, got ${JSON.stringify(r)}`);
  if ('ok' in r) {
    assert.equal(r.apiKey, 'mcpk_minted');
    assert.equal(r.cliCallback, CB);
  }
  assert.equal(issued.length, 1);
  assert.ok(issued[0].endsWith(':github'));
  assert.ok(!issued[0].includes('12345'), 'owner hash must not contain the raw github id');
  assert.equal(store.data.size, 0, 'state consumed (one-time)');
});

test('complete fails closed when issuance fails', async () => {
  setEnv();
  const store = memStore({ [`login:state:${STATE}`]: CB });
  const issue: IssueFn = async () => null; // issuance failed
  const r = await completeLogin(STATE, 'code', store, goodTransport, issue);
  assert.deepEqual(r, { error: 'issue_failed' });
});

test('complete rejects an unknown/consumed state', async () => {
  setEnv();
  const r = await completeLogin(STATE, 'code', memStore(), goodTransport, async () => 'x');
  assert.deepEqual(r, { error: 'invalid_state' });
});

test('complete rejects a stored non-loopback callback (defense in depth)', async () => {
  setEnv();
  const store = memStore({ [`login:state:${STATE}`]: 'http://evil.example/cb' });
  const r = await completeLogin(STATE, 'code', store, goodTransport, async () => 'x');
  assert.deepEqual(r, { error: 'invalid_state' });
});

test('complete requires a pepper (never an unsalted owner hash)', async () => {
  setEnv();
  delete process.env.MCPINDEX_LOGIN_PEPPER;
  delete process.env.DRIFT_OAUTH_PEPPER;
  const store = memStore({ [`login:state:${STATE}`]: CB });
  const r = await completeLogin(STATE, 'code', store, goodTransport, async () => 'x');
  assert.deepEqual(r, { error: 'unavailable' });
});

test('a dedicated login client id takes precedence over the drift client id', () => {
  setEnv();
  process.env.MCPINDEX_LOGIN_CLIENT_ID = 'login-cid';
  const url = buildAuthorizeUrl('a'.repeat(64))!;
  assert.ok(url.includes('client_id=login-cid'), 'uses the dedicated login app when set');
  delete process.env.MCPINDEX_LOGIN_CLIENT_ID;
  const url2 = buildAuthorizeUrl('a'.repeat(64))!;
  assert.ok(url2.includes('client_id=cid'), 'falls back to the drift client id when unset');
});

test('buildAuthorizeUrl requests only read:user (never repo scope)', () => {
  setEnv();
  const url = buildAuthorizeUrl(STATE)!;
  assert.ok(url.includes('scope=read%3Auser'));
  assert.ok(!url.includes('repo'), 'must never request repo scope');
});
