// Slug identity: slugify is lossy; disambiguateSlugs must keep public slugs injective.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { disambiguateSlugs, findDeprecatedServer, mergeAdmitted, slugify } from './registry';
import type { IndexedServer, RegistryEntry } from './types';

function stub(name: string): IndexedServer {
  return {
    source: 'registry',
    slug: slugify(name),
    baseSlug: slugify(name),
    name,
    title: name,
    description: 'd',
    version: '1.0.0',
    category: 'other',
    publishedAt: '',
    updatedAt: '',
    status: 'active',
    hasRemote: false,
    hasPackage: true,
    primaryTransport: 'stdio',
    envVars: [],
  };
}

function expectedDisambiguated(name: string): string {
  const base = slugify(name);
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 12);
  return `${base}-${hash}`;
}

test('slugify is stable for a non-colliding registry name', () => {
  assert.equal(slugify('io.github.example/my-server'), 'io-github-example-my-server');
});

test('case-only twins collapse under slugify (the bug shape)', () => {
  assert.equal(slugify('io.github.SceneView/mcp'), slugify('io.github.sceneview/mcp'));
});

test('hyphen vs underscore twins collapse under slugify (the bug shape)', () => {
  assert.equal(
    slugify('io.github.daedalus/mcp-reverse-engineering'),
    slugify('io.github.daedalus/mcp_reverse_engineering'),
  );
});

test('disambiguateSlugs leaves a singleton unchanged', () => {
  const s = stub('io.github.example/unique-server');
  const out = disambiguateSlugs([s]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.slug, slugify(s.name));
});

test('disambiguateSlugs hashes EVERY member of a colliding set (no first-wins)', () => {
  const a = 'io.github.SceneView/mcp';
  const b = 'io.github.sceneview/mcp';
  const out = disambiguateSlugs([stub(a), stub(b)]);
  assert.equal(out.length, 2);
  const slugs = new Set(out.map((s) => s.slug));
  assert.equal(slugs.size, 2);
  assert.ok(!slugs.has(slugify(a)), 'bare colliding slug must be retired');
  assert.equal(out.find((s) => s.name === a)!.slug, expectedDisambiguated(a));
  assert.equal(out.find((s) => s.name === b)!.slug, expectedDisambiguated(b));
});

test('shared marketing titles still get distinct slugs (LocalSynapse shape)', () => {
  const a = 'io.github.LocalSynapse/LocalSynapse-mcp';
  const b = 'io.github.LocalSynapse/localsynapse-mcp';
  assert.equal(slugify(a), slugify(b));
  const out = disambiguateSlugs([stub(a), stub(b)]);
  assert.equal(new Set(out.map((s) => s.slug)).size, 2);
});

test('final slugs are injective over a mixed fixture', () => {
  const names = [
    'io.github.example/unique-a',
    'io.github.example/unique-b',
    'io.github.SceneView/mcp',
    'io.github.sceneview/mcp',
    'io.github.daedalus/mcp-reverse-engineering',
    'io.github.daedalus/mcp_reverse_engineering',
    'io.github.LocalSynapse/LocalSynapse-mcp',
    'io.github.LocalSynapse/localsynapse-mcp',
  ];
  const out = disambiguateSlugs(names.map(stub));
  assert.equal(new Set(out.map((s) => s.slug)).size, out.length);
  // Non-colliders keep legacy slugify output
  assert.equal(out.find((s) => s.name === names[0])!.slug, slugify(names[0]!));
});

function deprecatedEntry(name: string): RegistryEntry {
  return {
    server: {
      name,
      title: name,
      description: 'deprecated fixture',
      version: '0.0.1',
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'deprecated',
        statusChangedAt: '2026-07-20T00:00:00.000Z',
        publishedAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-20T00:00:00.000Z',
        isLatest: true,
      },
    },
  };
}

test('findDeprecatedServer resolves a bare historical slug (khiip shape)', () => {
  const name = 'io.github.KhiipAI/khiip';
  const slug = slugify(name);
  const hit = findDeprecatedServer(slug, [deprecatedEntry(name)], new Set());
  assert.ok(hit);
  assert.equal(hit!.name, name);
  assert.equal(hit!.slug, slug);
  assert.equal(hit!.status, 'deprecated');
});

test('findDeprecatedServer does not alias an active slug', () => {
  const name = 'io.github.example/taken';
  const slug = slugify(name);
  const hit = findDeprecatedServer(slug, [deprecatedEntry(name)], new Set([slug]));
  assert.equal(hit, null);
  const hashed = findDeprecatedServer(
    expectedDisambiguated(name),
    [deprecatedEntry(name)],
    new Set([slug]),
  );
  assert.ok(hashed);
  assert.equal(hashed!.slug, expectedDisambiguated(name));
});

test('findDeprecatedServer ignores active-only entries', () => {
  const entry = deprecatedEntry('io.github.example/still-active-shape');
  entry._meta['io.modelcontextprotocol.registry/official'].status = 'active';
  assert.equal(
    findDeprecatedServer(slugify(entry.server.name), [entry], new Set()),
    null,
  );
});

// --- retired colliding bases -------------------------------------------------------
// The bare slug stops resolving the moment a second name collapses onto it, and it may
// have been live and indexed until then. On the 2026-07-28 corpus this was 5 bases over
// 10 servers, all 404ing in production. These pin the rule that the fix must NOT become
// a redirect: two subjects claim the slug, and picking one hands a reader the other's
// verdict - the exact misattribution disambiguateSlugs was written to prevent.

test('a colliding base is recoverable from the disambiguated set', () => {
  const twins = ['io.github.SceneView/mcp', 'io.github.sceneview/mcp'];
  const out = disambiguateSlugs(twins.map(stub));
  const base = slugify(twins[0]);
  // The base addresses nobody...
  assert.equal(out.some((s) => s.slug === base), false, 'bare base must not survive');
  // ...but every member still maps back to it via its unchanged name, which is what
  // getCollidingBase relies on to find the candidates.
  const members = out.filter((s) => slugify(s.name) === base);
  assert.equal(members.length, 2);
  assert.deepEqual(members.map((s) => s.name).sort(), [...twins].sort());
});

test('a singleton base still addresses its server, so it is never a colliding base', () => {
  const out = disambiguateSlugs([stub('io.github.example/only')]);
  const base = slugify('io.github.example/only');
  assert.equal(out[0].slug, base, 'a non-colliding slug must not be hashed');
  // getCollidingBase returns null whenever the slug resolves; this is that precondition.
  assert.ok(out.some((s) => s.slug === base));
});

test('members of a colliding set keep DISTINCT slugs (a chooser needs two destinations)', () => {
  const twins = ['io.github.Zuga-luga/Zugabot', 'io.github.Zuga-luga/zugabot'];
  const out = disambiguateSlugs(twins.map(stub));
  assert.notEqual(out[0].slug, out[1].slug);
  assert.equal(new Set(out.map((s) => s.slug)).size, 2);
  for (const s of out) assert.equal(s.slug, expectedDisambiguated(s.name));
});

test('three-way collisions disambiguate too (the chooser is not two-only)', () => {
  const names = ['a.b/Thing', 'a.b/thing', 'a.b/THING'];
  const out = disambiguateSlugs(names.map(stub));
  assert.equal(new Set(out.map((s) => s.slug)).size, 3);
  assert.equal(out.filter((s) => slugify(s.name) === slugify(names[0])).length, 3);
});

// --- baseSlug survives both hashing steps -------------------------------------------
// getCollidingBase groups on `baseSlug`, NOT on slugify(name), because mergeAdmitted
// PRE-hashes a colliding admitted row: its slug is already `base-<hash>` while
// slugify(name) is still the base. Recomputing from the name missed those rows, so a
// registry listing and an admitted row could claim one URL with the registry row silently
// owning it. These pin the invariant that makes the index correct.

test('disambiguateSlugs moves slug but never baseSlug', () => {
  const twins = ['io.github.SceneView/mcp', 'io.github.sceneview/mcp'];
  const out = disambiguateSlugs(twins.map(stub));
  for (const s of out) {
    assert.notEqual(s.slug, s.baseSlug, 'a colliding member must be hashed');
    assert.equal(s.baseSlug, slugify(s.name), 'baseSlug is the pre-hash slug');
  }
  assert.equal(new Set(out.map((s) => s.baseSlug)).size, 1, 'both stay in one group');
});

test('mergeAdmitted pre-hash keeps the admitted row in its colliding GROUP', () => {
  // The exact shape from a6a1a4d: registry row keeps the bare slug, admitted row is
  // pre-hashed. Both must still report the same baseSlug or the group loses a member.
  const registryRow = stub('io.github.mcp/server_git');
  const admittedRow = { ...stub('io.github.mcp/server-git'), source: 'admitted' as const };
  assert.equal(registryRow.baseSlug, admittedRow.baseSlug, 'precondition: they collide');

  const merged = mergeAdmitted([registryRow], [admittedRow]);
  const admittedOut = merged.find((s) => s.source === 'admitted')!;
  const registryOut = merged.find((s) => s.source === 'registry')!;

  assert.equal(registryOut.slug, registryRow.baseSlug, 'incumbent keeps the live URL');
  assert.notEqual(admittedOut.slug, admittedOut.baseSlug, 'admitted row was pre-hashed');
  assert.equal(
    admittedOut.baseSlug, registryOut.baseSlug,
    'the pre-hashed row must remain findable as a claimant of that base',
  );
});

test('a doubly-hashed admitted row still reports its ORIGINAL base', () => {
  // Pre-hash then disambiguate: slug gains two suffixes. baseSlug must not follow, or the
  // formerly-live URL becomes unreachable with no chooser and no redirect.
  const registryRow = stub('io.github.mcp/server_git');
  const admittedRow = { ...stub('io.github.mcp/server-git'), source: 'admitted' as const };
  const out = disambiguateSlugs(mergeAdmitted([registryRow], [admittedRow]));
  for (const s of out) {
    assert.equal(s.baseSlug, slugify('io.github.mcp/server_git'));
  }
});
