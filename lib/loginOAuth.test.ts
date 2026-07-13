import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildAuthorizeUrl,
  completeLogin,
  isLoopbackCallback,
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

function setEnv() {
  process.env.DRIFT_OAUTH_CLIENT_ID = 'cid';
  process.env.DRIFT_OAUTH_CLIENT_SECRET = 'csec';
  process.env.MCPINDEX_LOGIN_REDIRECT_URI = 'https://mcpindex.ai/api/auth/login/callback';
  process.env.MCPINDEX_LOGIN_PEPPER = 'pep';
}

test('loopback callback guard - only 127.0.0.1 / localhost allowed', () => {
  assert.ok(isLoopbackCallback('http://127.0.0.1:8765/cb'));
  assert.ok(isLoopbackCallback('http://localhost:5000'));
  assert.ok(!isLoopbackCallback('http://evil.example.com/cb'), 'external host rejected');
  assert.ok(!isLoopbackCallback('https://127.0.0.1/cb'), 'https/non-http rejected');
  assert.ok(!isLoopbackCallback('http://127.0.0.1.evil.com/cb'), 'suffix-host rejected');
  assert.ok(!isLoopbackCallback('http://[::1]/cb'), 'ipv6-literal not matched (kept simple)');
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

test('buildAuthorizeUrl requests only read:user (never repo scope)', () => {
  setEnv();
  const url = buildAuthorizeUrl(STATE)!;
  assert.ok(url.includes('scope=read%3Auser'));
  assert.ok(!url.includes('repo'), 'must never request repo scope');
});
