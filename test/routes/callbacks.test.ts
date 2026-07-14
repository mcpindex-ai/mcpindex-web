// Tier 2 seam #4 — the OAuth/login CALLBACK happy pages + exchange-failure branches, via new
// test-only transport/issue seams on lib/driftOAuth + lib/loginOAuth (the routes call them with
// default transports, so these seams are the only way to reach the 200 HTML without live GitHub).
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, snapshotEnv, mockRedis } from './_harness';
import { __setDriftOAuthRedisForTest, __setOAuthTransportForTest } from '../../lib/driftOAuth';
import { __setLoginTransportForTest, __setLoginIssueForTest, startLogin } from '../../lib/loginOAuth';
import { loginStore, __setLoginStoreRedisForTest } from '../../lib/loginStore';
import { GET as oauthCallback } from '../../app/api/v1/drift/oauth/callback/route';
import { GET as loginCallback } from '../../app/api/auth/login/callback/route';

let restore: () => void;
beforeEach(() => { restore = snapshotEnv(); });
afterEach(() => {
  restore();
  __setDriftOAuthRedisForTest(undefined);
  __setOAuthTransportForTest(undefined);
  __setLoginStoreRedisForTest(undefined);
  __setLoginTransportForTest(undefined);
  __setLoginIssueForTest(undefined);
  delete process.env.MCPINDEX_LOGIN_PEPPER;
  delete process.env.MCPINDEX_LOGIN_CLIENT_ID;
  delete process.env.MCPINDEX_LOGIN_REDIRECT_URI;
  delete process.env.DRIFT_OAUTH_PEPPER; // else it leaks to later tests in this file (not a GATE_FLAG)
});

// ---- B6 drift/oauth/callback ----
// redis that returns a valid pending install_id for the state lookup; eval (the bind script) → ok.
const oauthRedis = () => Object.assign(mockRedis(), { async get() { return FIX.ID32_OK; }, async eval() { return 'ok'; } });

test('oauth/callback: valid state + successful exchange → 200 HTML "GitHub linked"', async () => {
  process.env.DRIFT_OAUTH_UPGRADE = '1';
  process.env.DRIFT_OAUTH_PEPPER = 'test-pepper';
  __setDriftOAuthRedisForTest(oauthRedis());
  __setOAuthTransportForTest({ async exchangeCode() { return 'gho_token'; }, async fetchUserId() { return '12345'; } });
  const r = await callRoute(oauthCallback, '/api/v1/drift/oauth/callback', { query: { code: 'abc', state: FIX.STATE64_OK } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /text\/html/);
  assert.match(r.text, /linked/i);
});

test('oauth/callback: exchange returns no token → 400 (fail-closed)', async () => {
  process.env.DRIFT_OAUTH_UPGRADE = '1';
  process.env.DRIFT_OAUTH_PEPPER = 'test-pepper';
  __setDriftOAuthRedisForTest(oauthRedis());
  __setOAuthTransportForTest({ async exchangeCode() { return null; }, async fetchUserId() { return null; } });
  const r = await callRoute(oauthCallback, '/api/v1/drift/oauth/callback', { query: { code: 'abc', state: FIX.STATE64_OK } });
  assert.equal(r.status, 400);
});

// ---- B16 auth/login/callback ----
test('login/callback: full start→callback flow mints a key → 200 HTML success', async () => {
  process.env.MCPINDEX_LOGIN_ENABLED = '1';
  process.env.MCPINDEX_LOGIN_PEPPER = 'test-pepper';
  process.env.MCPINDEX_LOGIN_CLIENT_ID = 'test-client';
  process.env.MCPINDEX_LOGIN_REDIRECT_URI = 'http://127.0.0.1:8976/oauth';
  const redis = mockRedis();
  __setLoginStoreRedisForTest(redis);
  __setLoginTransportForTest({ async exchangeCode() { return 'gho_token'; }, async fetchUserId() { return 'gh-subject-123'; } });
  __setLoginIssueForTest(async () => 'mcpk_testkey123');

  // Real start leg: stores the one-time state in the (mocked) store.
  const started = await startLogin('http://127.0.0.1:8976/callback', loginStore()!);
  assert.ok('url' in started, 'startLogin should succeed: ' + JSON.stringify(started));
  const state = new URL(started.url).searchParams.get('state')!;
  assert.ok(state);

  const r = await callRoute(loginCallback, '/api/auth/login/callback', { query: { code: 'abc', state } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /text\/html/);
  // security headers on the key-bearing page
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('login/callback: exchange failure → non-200 HTML (fail-closed, no key minted)', async () => {
  process.env.MCPINDEX_LOGIN_ENABLED = '1';
  process.env.MCPINDEX_LOGIN_PEPPER = 'test-pepper';
  process.env.MCPINDEX_LOGIN_CLIENT_ID = 'test-client';
  process.env.MCPINDEX_LOGIN_REDIRECT_URI = 'http://127.0.0.1:8976/oauth';
  const redis = mockRedis();
  __setLoginStoreRedisForTest(redis);
  __setLoginTransportForTest({ async exchangeCode() { return null; }, async fetchUserId() { return null; } });
  const started = await startLogin('http://127.0.0.1:8976/callback', loginStore()!);
  const state = 'url' in started ? new URL(started.url).searchParams.get('state')! : FIX.STATE64_OK;
  const r = await callRoute(loginCallback, '/api/auth/login/callback', { query: { code: 'abc', state } });
  assert.notEqual(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /text\/html/);
});
