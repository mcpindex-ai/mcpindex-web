// /api/registry/claimable + the wizard's claimableOrigin: a templated or non-https remote has no
// origin an owner can serve the challenge from, so it must not be offered as claimable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { GET as claimable } from '../../app/api/registry/claimable/route';
import { claimableOrigin } from '../../lib/claimableRemote';

test('claimableOrigin: templated hosts and non-https remotes are not claimable', () => {
  assert.equal(claimableOrigin('https://{tenant}.gatana.ai/mcp'), '');
  assert.equal(claimableOrigin('https://api.example.com/{region}/mcp'), '');
  assert.equal(claimableOrigin('http://api.example.com/mcp'), '');
  assert.equal(claimableOrigin('not a url'), '');
  assert.equal(claimableOrigin('https://api.example.com/mcp?x=1'), 'https://api.example.com');
});

test('claimable: no result carries a templated remote', async () => {
  for (const q of ['gatana', 'tenant', 'mcp']) {
    const r = await callRoute(claimable, '/api/registry/claimable', { query: { q, limit: '50' } });
    assert.equal(r.status, 200);
    const body = r.json() as { results?: Array<{ remote: string }> };
    for (const hit of body.results ?? []) assert.doesNotMatch(hit.remote, /[{}]/, `${q}: ${hit.remote}`);
  }
});
