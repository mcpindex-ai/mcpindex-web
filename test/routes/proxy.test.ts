import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

// The AEO cache-bust guard: a query string on an llms route is collapsed to the canonical
// (cacheable) URL with a tiny 308, so `?_=N` can't defeat the /llms-full.txt s-maxage=60 shield
// and force a 4MB origin render per request.
test('proxy: query string on /llms-full.txt → 308 to the canonical URL (cache-bust guard)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/llms-full.txt?_=1'));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://mcpindex.ai/llms-full.txt');
});

test('proxy: query string on /llms.txt → 308 to the canonical URL', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/llms.txt?utm=x&_=2'));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://mcpindex.ai/llms.txt');
});

test('proxy: bare llms URL passes through (no redirect loop)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/llms-full.txt'));
  assert.notEqual(res.status, 308);
});

test('proxy: query on a non-llms limited route is NOT query-stripped', () => {
  // /api/v1/* is rate-limited but its query is meaningful (e.g. ?q=), so it must not be redirected.
  const res = proxy(new NextRequest('https://mcpindex.ai/api/v1/search?q=pdf'));
  assert.notEqual(res.status, 308);
});

test('proxy: >60 llms requests/min/IP → 429', () => {
  const headers = { 'x-vercel-forwarded-for': '9.9.9.101' };
  let last;
  for (let i = 0; i < 61; i++) {
    last = proxy(new NextRequest('https://mcpindex.ai/llms-full.txt', { headers }));
  }
  assert.equal(last!.status, 429);
});

test('proxy: exhausting the llms budget does NOT 429 the same IP on /api/v1 (routeClass split)', () => {
  const headers = { 'x-vercel-forwarded-for': '9.9.9.102' };
  for (let i = 0; i < 61; i++) {
    proxy(new NextRequest('https://mcpindex.ai/llms-full.txt', { headers })); // exhaust llms:ip
  }
  const api = proxy(new NextRequest('https://mcpindex.ai/api/v1/search?q=x', { headers }));
  assert.notEqual(api.status, 429, 'api bucket must be independent of the llms bucket');
});

test('proxy: known-gone /server/<slug> → 410 (GSC drop signal)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/server/net-csclear-venue'));
  assert.equal(res.status, 410);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('proxy: seeded rename /server/<slug> → 308 to successor', () => {
  const res = proxy(
    new NextRequest('https://mcpindex.ai/server/eu-ansvar-eu-regulations-mcp'),
  );
  assert.equal(res.status, 308);
  assert.equal(
    res.headers.get('location'),
    'https://mcpindex.ai/server/eu-ansvar-eu-regulations',
  );
});

test('proxy: live /server/<slug> passes through (no 410/308)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/server/eu-ansvar-romanian-law-mcp'));
  assert.notEqual(res.status, 410);
  assert.notEqual(res.status, 308);
});
