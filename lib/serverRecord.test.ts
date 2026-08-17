import test from 'node:test';
import assert from 'node:assert/strict';
import { describeDistribution, displayVersion, recordDetails, recordOpening } from './serverRecord';
import type { IndexedServer } from './types';

function srv(over: Partial<IndexedServer> = {}): IndexedServer {
  return {
    source: 'registry',
    slug: 's',
    baseSlug: 's',
    name: 'io.github.x/s',
    title: 'S',
    description: 'd',
    version: '1.0.0',
    category: 'other',
    publishedAt: '2026-07-20T21:38:18Z',
    updatedAt: '2026-07-20T21:38:18Z',
    status: 'active',
    hasRemote: false,
    hasPackage: false,
    primaryTransport: null,
    envVars: [],
    ...over,
  };
}

test('displayVersion strips exactly one leading v', () => {
  assert.equal(displayVersion('4.82.0'), '4.82.0');
  assert.equal(displayVersion('v4.82.0'), '4.82.0');
});

test('distribution: named surfaces join with "and"', () => {
  const s = srv({ npmPackage: 'x', dockerImage: 'y/x', hasPackage: true });
  assert.equal(describeDistribution(s), 'as x on npm and as the Docker image y/x');
});

test('distribution: remote names its transport', () => {
  const s = srv({ hasRemote: true, primaryTransport: 'streamable-http' });
  assert.equal(describeDistribution(s), 'as a hosted remote over streamable-http');
});

test('distribution: unnameable package (mcpb, nuget, ...) never claims absence', () => {
  const s = srv({ hasPackage: true });
  assert.equal(describeDistribution(s), 'through a declared package');
});

test('distribution: true absence is stated', () => {
  assert.equal(describeDistribution(srv()), 'with no declared package or remote');
});

test('opening scopes dates to the current version, never the server lifetime', () => {
  const out = recordOpening(srv());
  assert.equal(out, 'The current version, v1.0.0, was published to the official MCP registry on 2026-07-20.');
  assert.doesNotMatch(out, /entered|has not been updated/);
});

test('opening: same-day update is not claimed as untouched (raw-instant compare)', () => {
  const out = recordOpening(srv({ updatedAt: '2026-07-20T23:59:59Z' }));
  assert.match(out, /last touched 2026-07-20/);
});

test('opening: differing days render both dates', () => {
  const out = recordOpening(srv({ updatedAt: '2026-08-03T00:00:00Z' }));
  assert.match(out, /published to the official MCP registry on 2026-07-20/);
  assert.match(out, /last touched 2026-08-03/);
});

test('opening: an invalid date drops the clause instead of rendering "on ,"', () => {
  const out = recordOpening(srv({ publishedAt: 'not-a-date' }));
  assert.equal(out, 'The current version in the official MCP registry is v1.0.0.');
});

test('opening: admitted listing attributes dates and states non-listing', () => {
  const out = recordOpening(srv({ source: 'admitted', updatedAt: '2026-08-01T00:00:00Z' }));
  assert.match(out, /per its package registry/);
  assert.match(out, /not listed in the official MCP registry/);
});

test('details: env count deduplicates names repeated across packages', () => {
  const s = srv({
    envVars: [
      { name: 'TOKEN' },
      { name: 'TOKEN' },
      { name: 'HOST' },
    ],
  });
  assert.match(recordDetails(s), /declares 2 environment variables/);
});

test('details: category renders its display label, attributed to the index', () => {
  const s = srv({ category: 'other' });
  assert.match(recordDetails(s), /filed under .+ by this index/);
});

test('details: zero env vars adds no clause', () => {
  assert.doesNotMatch(recordDetails(srv()), /environment variable/);
});
