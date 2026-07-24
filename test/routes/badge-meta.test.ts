// GET /api/v1/badge/meta/[kind] — corpus count badges for README social proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { GET } from '../../app/api/v1/badge/meta/[kind]/route';
import { getServerCount } from '../../lib/registry';
import { listScreened } from '../../lib/verdicts';

const svgOk = (r: { status: number; headers: Headers; text: string }) => {
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(r.text, /^<svg[\s>]/);
};

test('meta badge: servers matches getServerCount()', async () => {
  const expected = (await getServerCount()).toLocaleString('en-US');
  const r = await callRoute(GET, '/api/v1/badge/meta/servers', { params: { kind: 'servers' } });
  svgOk(r);
  assert.match(r.text, new RegExp(`${expected} servers`));
  assert.match(r.text, /mcpindex/);
  assert.doesNotMatch(r.text, /safe|verified|certified|trusted/i);
});

test('meta badge: screened matches listScreened().length', async () => {
  const expected = (await listScreened()).length.toLocaleString('en-US');
  const r = await callRoute(GET, '/api/v1/badge/meta/screened', { params: { kind: 'screened' } });
  svgOk(r);
  assert.match(r.text, new RegExp(`${expected} screened`));
  assert.doesNotMatch(r.text, /safe|verified|certified|trusted/i);
});

test('meta badge: unknown kind → 404', async () => {
  const r = await callRoute(GET, '/api/v1/badge/meta/stars', { params: { kind: 'stars' } });
  assert.equal(r.status, 404);
});

test('meta badge: servers.svg strips extension (GitHub Camo-friendly path)', async () => {
  const expected = (await getServerCount()).toLocaleString('en-US');
  const r = await callRoute(GET, '/api/v1/badge/meta/servers.svg', {
    params: { kind: 'servers.svg' },
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(r.text, new RegExp(`${expected} servers`));
});

test('meta badge: 1h cache-control', async () => {
  const r = await callRoute(GET, '/api/v1/badge/meta/servers', { params: { kind: 'servers' } });
  assert.match(r.headers.get('cache-control') ?? '', /max-age=3600/);
});
