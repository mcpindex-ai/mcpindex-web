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

test('one bad row drops only itself - the good rows survive', () => {
  // All-or-nothing was the bug: a single mistyped date emptied the site's overlay while the
  // Python screener kept all rows, so the two computed different collision sets.
  const bad = { ...VALID.servers[0], admitted: { ...VALID.servers[0].admitted, updatedAt: '2026-07-10' } };
  const good = { ...VALID.servers[0], server: { ...VALID.servers[0].server, name: 'io.github.example/other' } };
  const doc = coerceAdmitted({ servers: [bad, good] });
  assert.equal(doc.servers.length, 1);
  assert.equal(doc.servers[0].server.name, 'io.github.example/other');
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

test('a non-ISO date is rejected', () => {
  // Guards the fabrication path: updatedAt feeds the published quality score and the
  // public API, so a hand-typed "2026-07-24" or "today" must not load.
  for (const bad of ['2026-07-24', 'today', '', 'July 24 2026']) {
    const doc = {
      servers: [
        { ...VALID.servers[0], admitted: { ...VALID.servers[0].admitted, updatedAt: bad } },
      ],
    };
    assert.deepEqual(coerceAdmitted(doc), { servers: [] }, `should reject "${bad}"`);
  }
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
    assert.ok(e.admitted.datesVerifiedFrom, `${e.server.name} must cite where its dates came from`);
  }
  // The fabrication smell: hand-stamping shows up as every entry sharing one timestamp.
  // Real package releases do not land at the same instant across seven packages.
  const stamps = new Set(doc.servers.map((e) => e.admitted.updatedAt));
  assert.ok(
    stamps.size > 1,
    'every admitted server shares one updatedAt - that is a hand-stamped date, not an observed one',
  );
});

test('an admitted server that upstream later publishes under a DIFFERENT name is dropped', () => {
  // Name-equality dedup misses this entirely: different name -> different slug -> no
  // collision -> both rows survive, and the admitted page keeps claiming the server is not
  // registry-listed when it now is. The package identifier survives the rename.
  const repo = 'https://github.com/modelcontextprotocol/servers';
  const registry = { ...srv('io.modelcontextprotocol/servers'), npmPackage: '@modelcontextprotocol/server-filesystem', repositoryUrl: repo };
  const admitted = { ...srv('io.github.modelcontextprotocol/server-filesystem', 'admitted'), npmPackage: '@modelcontextprotocol/server-filesystem', repositoryUrl: `${repo}.git` };
  const merged = mergeAdmitted([registry], [admitted]);
  assert.equal(merged.length, 1, 'the admitted duplicate must not survive');
  assert.equal(merged[0].source, 'registry');
});

test('identity matching is case- and trailing-slash-insensitive on remotes', () => {
  const registry = { ...srv('a/x'), remoteUrl: 'https://Example.com/MCP/' };
  const admitted = { ...srv('b/y', 'admitted'), remoteUrl: 'https://example.com/mcp' };
  assert.equal(mergeAdmitted([registry], [admitted]).length, 1);
});

test('a genuinely distinct admitted server is still kept', () => {
  const registry = { ...srv('a/x'), npmPackage: '@a/x', repositoryUrl: 'https://github.com/a/x' };
  const admitted = { ...srv('b/y', 'admitted'), npmPackage: '@b/y', repositoryUrl: 'https://github.com/b/y' };
  assert.equal(mergeAdmitted([registry], [admitted]).length, 2);
});

test('the same package name from a DIFFERENT repo does not delist an admitted server', () => {
  // A package identifier is not unique in an open-publish registry - 513 identifiers in the
  // live snapshot are claimed by more than one entry. Matching on identifier alone would let
  // anyone delist an admitted server by publishing an entry that names its package.
  const admitted = {
    ...srv('io.github.modelcontextprotocol/server-filesystem', 'admitted'),
    npmPackage: '@modelcontextprotocol/server-filesystem',
    repositoryUrl: 'https://github.com/modelcontextprotocol/servers',
  };
  const squatter = {
    ...srv('io.github.attacker/typosquat'),
    npmPackage: '@modelcontextprotocol/server-filesystem',
    repositoryUrl: 'https://github.com/attacker/typosquat',
  };
  const merged = mergeAdmitted([squatter], [admitted]);
  assert.equal(merged.length, 2, 'the admitted server must survive an unrelated claimant');
});
