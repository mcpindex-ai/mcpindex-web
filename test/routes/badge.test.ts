// A1 — GET /api/v1/badge/[slug]. SVG, always 200, fail-closed to a gray "not screened" badge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX } from './_harness';
import { GET } from '../../app/api/v1/badge/[slug]/route';

const svg = (r: { status: number; headers: Headers; text: string }) => {
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(r.text, /^<svg[\s>]/);
};

test('badge: screened slug renders a badge SVG (200)', async () => {
  const r = await callRoute(GET, `/api/v1/badge/${FIX.SCREENED}`, { params: { slug: FIX.SCREENED } });
  svg(r);
});

test('badge: unknown slug is fail-closed gray "not screened" (200, never a broken image)', async () => {
  const r = await callRoute(GET, `/api/v1/badge/${FIX.UNKNOWN}`, { params: { slug: FIX.UNKNOWN } });
  svg(r);
  assert.match(r.text, /not screened/i);
});

test('badge: fixture slug is excluded → gray not-screened (never a fake pass)', async () => {
  const r = await callRoute(GET, `/api/v1/badge/${FIX.FIXTURE}`, { params: { slug: FIX.FIXTURE } });
  svg(r);
  assert.match(r.text, /not screened/i);
});

test('badge: empty slug → gray (decodeSlug null)', async () => {
  const r = await callRoute(GET, '/api/v1/badge/', { params: { slug: '' } });
  svg(r);
});

test('badge: over-long slug (>256) → gray (cap defends edge cache)', async () => {
  const long = 'a'.repeat(300);
  const r = await callRoute(GET, `/api/v1/badge/${long}`, { params: { slug: long } });
  svg(r);
});

test('badge: sets a 300s cache-control', async () => {
  const r = await callRoute(GET, `/api/v1/badge/${FIX.SCREENED}`, { params: { slug: FIX.SCREENED } });
  assert.match(r.headers.get('cache-control') ?? '', /max-age=300/);
});
