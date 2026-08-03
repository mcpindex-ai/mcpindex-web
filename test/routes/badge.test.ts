// A1 — GET /api/v1/badge/[slug]. SVG, always 200, fail-closed to a gray "not screened" badge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, screenedSlug } from './_harness';
import { GET } from '../../app/api/v1/badge/[slug]/route';

const svg = (r: { status: number; headers: Headers; text: string }) => {
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /image\/svg\+xml/);
  assert.match(r.text, /^<svg[\s>]/);
};

test('badge: screened slug renders the SCREENED badge (not the gray fail-closed one)', async () => {
  const slug = await screenedSlug();
  const r = await callRoute(GET, `/api/v1/badge/${slug}`, { params: { slug } });
  svg(r);
  // Bite on a regression that flips a real screened server to the fail-closed gray badge:
  // the gray badge says "not screened"; the screened one must not.
  assert.match(r.text, /screened/i);
  assert.doesNotMatch(r.text, /not[\s-]*screened/i);
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

test('badge: empty slug → gray "not screened" (decodeSlug null)', async () => {
  const r = await callRoute(GET, '/api/v1/badge/', { params: { slug: '' } });
  svg(r);
  assert.match(r.text, /not[\s-]*screened/i);
});

test('badge: over-long slug (>256) → gray "not screened" (cap defends edge cache)', async () => {
  const long = 'a'.repeat(300);
  const r = await callRoute(GET, `/api/v1/badge/${long}`, { params: { slug: long } });
  svg(r);
  assert.match(r.text, /not[\s-]*screened/i);
});

test('badge: sets a 300s cache-control', async () => {
  const slug = await screenedSlug();
  const r = await callRoute(GET, `/api/v1/badge/${slug}`, { params: { slug } });
  assert.match(r.headers.get('cache-control') ?? '', /max-age=300/);
});
