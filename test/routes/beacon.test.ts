// POST /api/beacon — log-only, no service/data backing. Positive-allowlist on event name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { POST } from '../../app/api/beacon/route';

test('beacon: unknown event → 400 unsupported_event', async () => {
  const r = await callRoute(POST, '/api/beacon', { method: 'POST', body: { event: 'something_else' } });
  assert.equal(r.status, 400);
  assert.equal((r.json() as any).error, 'unsupported_event');
});

test('beacon: bad JSON → 400 (parses to {})', async () => {
  const r = await callRoute(POST, '/api/beacon', {
    method: 'POST',
    raw: 'not json',
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(r.status, 400);
});

test('beacon: valid event → 200 ok', async () => {
  const r = await callRoute(POST, '/api/beacon', { method: 'POST', body: { event: 'gate_install_copy', source: 'docs' } });
  assert.equal(r.status, 200);
  assert.equal((r.json() as any).ok, true);
});
