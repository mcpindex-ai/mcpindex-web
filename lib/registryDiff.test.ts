import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyDiff, type FirstSeenDoc } from './registryDiff';
import type { IndexedServer } from './types';
import { emptyFirstSeen, mergeFirstSeen, serializeFirstSeen } from '../scripts/first-seen.mjs';

function server(name: string, publishedAt: string, updatedAt = publishedAt): IndexedServer {
  return {
    source: 'registry',
    slug: name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    baseSlug: name.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    name,
    title: name,
    description: 'd',
    version: '1.0.0',
    category: 'other',
    publishedAt,
    updatedAt,
    status: 'active',
    hasRemote: false,
    hasPackage: true,
    primaryTransport: null,
    envVars: [],
  };
}

const SINCE = new Date('2026-10-13');

// The three shapes the endpoint has to tell apart. `released` is the case the old split got
// wrong: its latest version is new, so publishedAt alone made it look like a new server.
const released = server('io.example/released', '2026-10-15T08:00:00Z');
const brandNew = server('io.example/brand-new', '2026-10-14T08:00:00Z');
const unchanged = server('io.example/unchanged', '2026-08-01T08:00:00Z');

const doc: FirstSeenDoc = {
  schema_version: 1,
  observed_from: '2026-05-01T05:20:17.312Z',
  servers: {
    'io.example/released': '2026-07-02T10:00:00Z',
    'io.example/brand-new': '2026-10-14T08:00:00Z',
    'io.example/unchanged': '2026-08-01T08:00:00Z',
  },
};

const names = (xs: readonly IndexedServer[]) => xs.map((s) => s.name).sort();

describe('classifyDiff', () => {
  it('counts a new release of a server first seen before since as updated, not added', () => {
    const r = classifyDiff([released, brandNew, unchanged], doc, SINCE);
    assert.deepEqual(names(r.updated), ['io.example/released']);
    assert.deepEqual(names(r.added), ['io.example/brand-new']);
    assert.deepEqual(r.limits, []);
  });

  it('leaves a server with no activity in the window out of both lists', () => {
    const r = classifyDiff([unchanged], doc, SINCE);
    assert.equal(r.added.length + r.updated.length, 0);
  });

  it('counts a status edit on an existing server as updated', () => {
    const edited = server('io.example/unchanged', '2026-08-01T08:00:00Z', '2026-10-16T00:00:00Z');
    assert.deepEqual(names(classifyDiff([edited], doc, SINCE).updated), ['io.example/unchanged']);
  });

  it('is inclusive at since', () => {
    const atSince = server('io.example/at-since', SINCE.toISOString());
    assert.deepEqual(names(classifyDiff([atSince], doc, SINCE).added), ['io.example/at-since']);
  });

  it('falls back to publishedAt for a name the doc does not carry', () => {
    const admitted = { ...server('io.example/admitted', '2026-10-14T00:00:00Z'), source: 'admitted' as const };
    assert.deepEqual(names(classifyDiff([admitted], doc, SINCE).added), ['io.example/admitted']);
  });

  it('never dates a server later than its own record when the doc lags', () => {
    const lagging: FirstSeenDoc = { ...doc, servers: { 'io.example/unchanged': '2026-10-20T00:00:00Z' } };
    const r = classifyDiff([unchanged], lagging, SINCE);
    assert.equal(r.added.length + r.updated.length, 0);
  });

  it('states the limit when there is no doc, and the old split is what remains', () => {
    const r = classifyDiff([released, brandNew, unchanged], null, SINCE);
    assert.deepEqual(names(r.added), ['io.example/brand-new', 'io.example/released']);
    assert.deepEqual(r.limits, ['first_seen_unavailable_new_versions_counted_as_added']);
  });

  it('states the limit when since precedes the first snapshot folded in', () => {
    const r = classifyDiff([released], doc, new Date('2026-04-01'));
    assert.deepEqual(r.limits, ['since_precedes_first_seen_history']);
  });
});

describe('mergeFirstSeen', () => {
  const entry = (name: string, publishedAt: string) => ({
    server: { name },
    _meta: { 'io.modelcontextprotocol.registry/official': { publishedAt } },
  });

  it('keeps the earliest publishedAt per name and the earliest fetchedAt, in any order', () => {
    const a = { fetchedAt: '2026-07-01T00:00:00Z', servers: [entry('x', '2026-06-30T00:00:00Z')] };
    const b = {
      fetchedAt: '2026-10-01T00:00:00Z',
      servers: [entry('x', '2026-09-30T00:00:00Z'), entry('y', '2026-09-29T00:00:00Z')],
    };
    const fwd = emptyFirstSeen();
    assert.equal(mergeFirstSeen(fwd, a), 1);
    assert.equal(mergeFirstSeen(fwd, b), 1);
    const rev = emptyFirstSeen();
    mergeFirstSeen(rev, b);
    mergeFirstSeen(rev, a);
    assert.equal(serializeFirstSeen(fwd), serializeFirstSeen(rev));
    assert.deepEqual(fwd.servers, { x: '2026-06-30T00:00:00Z', y: '2026-09-29T00:00:00Z' });
    assert.equal(fwd.observed_from, '2026-07-01T00:00:00Z');
  });

  it('keeps a name that has left the snapshot', () => {
    const d = emptyFirstSeen();
    mergeFirstSeen(d, { fetchedAt: '2026-07-01T00:00:00Z', servers: [entry('gone', '2026-06-01T00:00:00Z')] });
    mergeFirstSeen(d, { fetchedAt: '2026-08-01T00:00:00Z', servers: [] });
    assert.equal(d.servers.gone, '2026-06-01T00:00:00Z');
  });
});
