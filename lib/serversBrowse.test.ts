import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BROWSE_PAGE_SIZE, browsePage, browseTotalPages } from './serversBrowse';
import { isEndpointShaped } from './serverJsonLd';
import type { IndexedServer } from './types';

function mk(slug: string, title: string): IndexedServer {
  return {
    source: 'registry',
    slug,
    name: slug,
    title,
    description: 'd',
    version: '1.0.0',
    category: 'other',
    publishedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    status: 'active',
    hasRemote: false,
    hasPackage: false,
    primaryTransport: null,
    envVars: [],
  };
}

test('browsePage: alphabetical, deterministic, correctly sliced', () => {
  const servers = [mk('c', 'Charlie'), mk('a', 'alpha'), mk('b', 'Bravo')];
  const p = browsePage(servers, 1);
  assert.ok(p);
  assert.deepEqual(p.items.map((s) => s.slug), ['a', 'b', 'c']); // case-insensitive A-Z
  assert.equal(p.totalPages, 1);
  assert.equal(p.totalServers, 3);
});

test('browsePage: same-title entries tiebreak on slug (total order)', () => {
  const servers = [mk('z-dup', 'Same'), mk('a-dup', 'Same')];
  const p = browsePage(servers, 1);
  assert.ok(p);
  assert.deepEqual(p.items.map((s) => s.slug), ['a-dup', 'z-dup']);
});

test('browsePage: pagination slices without overlap or gaps', () => {
  const servers = Array.from({ length: BROWSE_PAGE_SIZE + 5 }, (_, i) =>
    mk(`s${String(i).padStart(4, '0')}`, `S${String(i).padStart(4, '0')}`),
  );
  assert.equal(browseTotalPages(servers.length), 2);
  const p1 = browsePage(servers, 1);
  const p2 = browsePage(servers, 2);
  assert.ok(p1 && p2);
  assert.equal(p1.items.length, BROWSE_PAGE_SIZE);
  assert.equal(p2.items.length, 5);
  const all = [...p1.items, ...p2.items].map((s) => s.slug);
  assert.equal(new Set(all).size, servers.length);
});

test('browsePage: out-of-range and non-integer pages are null', () => {
  const servers = [mk('a', 'a')];
  assert.equal(browsePage(servers, 0), null);
  assert.equal(browsePage(servers, 2), null);
  assert.equal(browsePage(servers, 1.5), null);
});

test('browseTotalPages: empty registry still has one (empty) page', () => {
  assert.equal(browseTotalPages(0), 1);
});

test('isEndpointShaped: endpoint-shaped website URLs are caught', () => {
  assert.equal(isEndpointShaped('https://agentic-news.ai/mcp'), true);
  assert.equal(isEndpointShaped('https://x.example/api/mcp'), true);
  assert.equal(isEndpointShaped('https://x.example/sse'), true);
  assert.equal(isEndpointShaped('https://x.example/mcp/'), true); // trailing slash
  assert.equal(
    isEndpointShaped('https://site.example/', 'https://site.example/'),
    true, // equals the remote endpoint verbatim
  );
});

test('isEndpointShaped: real websites are not', () => {
  assert.equal(isEndpointShaped('https://lona.agency'), false);
  assert.equal(isEndpointShaped('https://example.com/docs/mcp-guide'), false);
  assert.equal(isEndpointShaped('https://mcp.example.com'), false); // host, not path
  assert.equal(isEndpointShaped('not a url'), false);
});
