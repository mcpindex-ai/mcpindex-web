import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { generateApiKey, issueApiKey, type IssueFetch } from './issueKey';

const OWNER = 'a'.repeat(64); // valid sha256-hex owner_hash
const ENV = {
  MCPINDEX_SUPABASE_URL: 'https://proj.supabase.co',
  MCPINDEX_SUPABASE_SERVICE_KEY: 'service-role-secret',
};

function recorder(status: number) {
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetchImpl: IssueFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: init.body });
    return { status };
  };
  return { calls, fetchImpl };
}

test('mint returns raw key; only the hash is POSTed', async () => {
  const { calls, fetchImpl } = recorder(204);
  const raw = await issueApiKey(OWNER, { tier: 'pro', provider: 'github' }, { env: ENV, fetchImpl });
  assert.ok(raw && raw.startsWith('mcpk_'), 'returns a prefixed raw key');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/rest/v1/rpc/issue_api_key'));
  assert.ok(!calls[0].body.includes(raw!), 'raw key must NEVER be sent (hash only)');
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.p_key_hash, createHash('sha256').update(raw!, 'utf8').digest('hex'));
  assert.equal(sent.p_owner_hash, OWNER);
  assert.equal(sent.p_tier, 'pro');
  assert.ok(calls[0].headers.Authorization.includes('service-role-secret'));
});

test('fail-closed on non-2xx', async () => {
  const { fetchImpl } = recorder(500);
  assert.equal(await issueApiKey(OWNER, {}, { env: ENV, fetchImpl }), null);
});

test('fail-closed on transport error', async () => {
  const fetchImpl: IssueFetch = async () => {
    throw new Error('network down');
  };
  assert.equal(await issueApiKey(OWNER, {}, { env: ENV, fetchImpl }), null);
});

test('fail-closed when unconfigured (no RPC call)', async () => {
  const { calls, fetchImpl } = recorder(204);
  assert.equal(await issueApiKey(OWNER, {}, { env: {}, fetchImpl }), null);
  assert.equal(calls.length, 0, 'unconfigured env must not call the transport');
});

test('rejects bad owner_hash and unknown tier before any RPC', async () => {
  const { calls, fetchImpl } = recorder(204);
  assert.equal(await issueApiKey('not-a-hash', {}, { env: ENV, fetchImpl }), null);
  assert.equal(await issueApiKey(OWNER, { tier: 'admin' }, { env: ENV, fetchImpl }), null);
  assert.equal(calls.length, 0);
});

test('generated keys are unique and prefixed', () => {
  const keys = new Set(Array.from({ length: 200 }, () => generateApiKey()));
  assert.equal(keys.size, 200);
  assert.ok([...keys].every((k) => k.startsWith('mcpk_')));
});
