import test from 'node:test';
import assert from 'node:assert/strict';
import { coerceAdmitted } from './admitted';
import { disambiguateSlugs, mergeAdmitted, normalizeAdmitted, slugify } from './registry';
import type { AdmittedEntry, IndexedServer, ServerSource } from './types';

function srv(name: string, source: ServerSource = 'registry'): IndexedServer {
  return {
    source,
    slug: slugify(name),
    name,
    title: name,
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

const VALID = {
  servers: [
    {
      server: {
        name: 'io.github.example/thing',
        title: 'Thing',
        description: 'Does a thing.',
        version: '1.2.3',
        repository: { url: 'https://github.com/example/thing' },
        packages: [{ registryType: 'npm', identifier: '@example/thing', version: '1.2.3' }],
      },
      admitted: {
        reason: 'Widely used and absent upstream.',
        admittedAt: '2026-07-24',
        publishedAt: '2026-07-24T00:00:00Z',
        updatedAt: '2026-07-24T00:00:00Z',
      },
    },
  ],
};

test('a valid overlay parses', () => {
  const doc = coerceAdmitted(VALID);
  assert.equal(doc.servers.length, 1);
  assert.equal(doc.servers[0].server.name, 'io.github.example/thing');
});

test('a malformed overlay yields an empty doc rather than throwing', () => {
  // A bad hand-edit must degrade to "the admitted servers are missing", never to a
  // 500 on every page - loadServers() depends on this.
  for (const bad of [null, 42, 'nope', {}, { servers: 'x' }, { servers: [{ server: {} }] }]) {
    assert.deepEqual(coerceAdmitted(bad), { servers: [] });
  }
});

test('an entry missing its admission reason is rejected', () => {
  const noReason = {
    servers: [{ ...VALID.servers[0], admitted: { ...VALID.servers[0].admitted, reason: '' } }],
  };
  assert.deepEqual(coerceAdmitted(noReason), { servers: [] });
});

test('unknown keys pass through instead of failing the load', () => {
  const extra = {
    servers: [{ ...VALID.servers[0], server: { ...VALID.servers[0].server, futureField: 1 } }],
    somethingNew: true,
  };
  assert.equal(coerceAdmitted(extra).servers.length, 1);
});

test('normalizeAdmitted stamps admitted provenance and never registry provenance', () => {
  const s = normalizeAdmitted(VALID.servers[0] as AdmittedEntry);
  assert.equal(s.source, 'admitted');
  assert.equal(s.admittedReason, 'Widely used and absent upstream.');
  assert.equal(s.status, 'active');
  // slugify maps '/' to '--' then collapses runs of hyphens, so the separator lands as one.
  assert.equal(s.slug, 'io-github-example-thing');
  assert.equal(s.npmPackage, '@example/thing');
  // Dates come from the admission block, not from a fabricated official-registry _meta.
  assert.equal(s.publishedAt, '2026-07-24T00:00:00Z');
});

test('an empty overlay leaves the registry set identical', () => {
  const registry = [srv('a/one'), srv('b/two')];
  assert.deepEqual(mergeAdmitted(registry, []), registry);
});

test('admitted rows are appended last so name-dedup favours the registry', () => {
  const registry = [srv('a/one')];
  const admitted = [srv('z/late', 'admitted')];
  assert.deepEqual(
    mergeAdmitted(registry, admitted).map((s) => s.name),
    ['a/one', 'z/late'],
  );
});

test('an admitted row colliding with a registry slug is DROPPED, not disambiguated', () => {
  // The failure this prevents: disambiguateSlugs() hashes every member of a colliding
  // set, so admitting a colliding row would rename the live registry URL.
  const registry = [srv('example.com/thing')];
  const liveSlug = registry[0].slug;
  const colliding = srv('example_com/thing', 'admitted');
  assert.equal(colliding.slug, liveSlug, 'fixture must actually collide');

  const merged = mergeAdmitted(registry, [colliding]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'example.com/thing');

  // And the live slug survives disambiguation untouched.
  assert.equal(disambiguateSlugs(merged)[0].slug, liveSlug);
});

test('admitted rows without a description are dropped', () => {
  const bare = { ...srv('a/x', 'admitted'), description: '' };
  assert.deepEqual(mergeAdmitted([], [bare]), []);
});

test('the shipped overlay is valid and carries only reference servers', async () => {
  const fs = await import('node:fs/promises');
  const raw = JSON.parse(await fs.readFile('data/admitted.json', 'utf8'));
  const doc = coerceAdmitted(raw);
  assert.ok(doc.servers.length > 0, 'shipped overlay must parse');
  for (const e of doc.servers) {
    // Every admitted listing needs a runnable target and a published reason, or it is
    // just noise in the index.
    assert.ok(e.admitted.reason.length > 20, `${e.server.name} needs a real reason`);
    assert.ok(
      (e.server.packages?.length ?? 0) > 0 || (e.server.remotes?.length ?? 0) > 0,
      `${e.server.name} needs a package or remote`,
    );
    assert.match(e.server.name, /\//, `${e.server.name} needs a publisher namespace`);
  }
});
