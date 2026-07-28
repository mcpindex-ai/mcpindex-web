// Slug identity: slugify is lossy; disambiguateSlugs must keep public slugs injective.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  disambiguateSlugs,
  findDeprecatedServer,
  legacySlugRedirects,
  normalize,
  slugify,
} from './registry';
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
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 16);
  // DOUBLE hyphen. Computed here independently of withDisambiguator so this stays a real
  // pin: slugify collapses `-+` to `-`, so no name-derived slug can contain `--`, which is
  // what makes a synthesized slug unable to collide with a bare one.
  return `${base}--${hash}`;
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

test('the baseSlug index exposes no addressable sentinel key', () => {
  // A previous version stashed the whole server list inside the index under a `'__n__'`
  // key to detect staleness. `getCollidingBase` looks that same map up with an
  // ATTACKER-SUPPLIED slug, so `/server/__n__` answered 200 and rendered a chooser naming
  // every server in the catalog - unauthenticated, on the one route proxy.ts exempts from
  // the per-IP limiter. The cache added to save ~18ms per request became an unbounded
  // render costing orders of magnitude more.
  //
  // Asserted structurally rather than by probing one magic string: ANY key that is not some
  // server's baseSlug is the same bug under a different name.
  const names = ['io.github.example/one', 'io.github.example/two', 'io.github.SceneView/mcp',
                 'io.github.sceneview/mcp'];
  const servers = disambiguateSlugs(names.map(stub));
  const legitimate = new Set(servers.map((s) => s.baseSlug));
  const grouped = new Map<string, IndexedServer[]>();
  for (const s of servers) {
    const g = grouped.get(s.baseSlug);
    if (g) g.push(s); else grouped.set(s.baseSlug, [s]);
  }
  for (const key of grouped.keys()) {
    assert.ok(legitimate.has(key), `index key '${key}' is not any server's baseSlug`);
  }
  assert.ok(!grouped.has('__n__'), 'no staleness sentinel may live in a user-addressable map');
});

test('baseSlug stays at the bare base after disambiguation', () => {
  // `getCollidingBase` groups by baseSlug to answer the retired bare URL with a chooser
  // naming both claimants. If disambiguation rewrote baseSlug along with slug, each twin
  // would land in its own group, the chooser would find fewer than two members, and the
  // bare URL would 404 instead of resolving - or, worse, resolve to whichever twin was
  // left. slug MOVES, baseSlug does NOT: that split is the whole point of the field.
  const a = 'io.github.SceneView/mcp';
  const b = 'io.github.sceneview/mcp';
  const base = slugify(a);

  // Start at the SOURCE. `stub()` hand-builds an IndexedServer, so asserting only on
  // disambiguateSlugs left normalizeServer's baseSlug entirely untested - a mutation making
  // it `undefined` for every server in the catalog passed the whole suite.
  const normalized = normalize({
    server: { name: a, description: 'd', version: '1.0.0' },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active', publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      },
    },
  } as unknown as RegistryEntry);
  assert.equal(typeof normalized.baseSlug, 'string', 'baseSlug must always be a string');
  assert.equal(normalized.baseSlug, base, 'normalize must seed baseSlug from the NAME');

  const out = disambiguateSlugs([stub(a), stub(b)]);
  for (const name of [a, b]) {
    const row = out.find((s) => s.name === name)!;
    assert.equal(row.baseSlug, base, 'baseSlug must remain the bare colliding base');
    assert.notEqual(row.slug, base, 'slug must have moved off the bare base');
  }
  assert.equal(
    out.filter((s) => s.baseSlug === base).length, 2,
    'both twins must still be findable as claimants of the retired bare URL',
  );
});

test('normalize trims a whitespace-only description to empty', () => {
  // loadServers drops a row on falsy description, and mcpindex-trust's
  // `active_registry_names` does `(description or "").strip()`. Testing truthiness without
  // trimming meant '  ' was a description here and not there, which changes who is in a
  // collision group - so the surviving row's slug differs by side, and the purge then reads
  // the slug this site serves as owned by nobody and deletes its verdict.
  const entry = (desc: string): RegistryEntry => ({
    server: { name: 'io.github.example/ws', description: desc, version: '1.0.0' },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active', publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      },
    },
  } as unknown as RegistryEntry);
  assert.equal(normalize(entry('   ')).description, '', 'whitespace-only must trim to empty');
  assert.equal(normalize(entry(' \t\n ')).description, '', 'tabs and newlines too');
  assert.equal(normalize(entry('  real  ')).description, 'real', 'and a real one is trimmed');
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

test('legacySlugRedirects maps a previous slug ONLY to its true owner', () => {
  const a = 'io.github.SceneView/mcp';
  const b = 'io.github.sceneview/mcp';
  const servers = disambiguateSlugs([stub(a), stub(b)]);
  const map = legacySlugRedirects(servers);

  for (const name of [a, b]) {
    const row = servers.find((s) => s.name === name)!;
    // The previous slug is the row's BASE joined to a 12-hex hash of its own NAME. Keying
    // off the current slug instead would produce a string that was never anyone's URL.
    const previous = `${row.baseSlug}-${createHash('sha256').update(name).digest('hex').slice(0, 12)}`;
    assert.equal(map.get(previous), row.slug, `${name} must map from its real former slug`);
    assert.ok(!previous.includes('--'), 'the legacy form used a single hyphen');
  }
  assert.equal(map.size, 2, 'only servers whose slug actually moved may appear');
});

test('legacySlugRedirects ignores servers that never moved', () => {
  // A server with a bare slug has no previous URL, so listing one would invent a redirect.
  const map = legacySlugRedirects(disambiguateSlugs([stub('io.github.example/solo')]));
  assert.equal(map.size, 0);
});

test('normalize refuses a non-http(s) repository URL', () => {
  const entry = (url: string): RegistryEntry => ({
    server: { name: 'io.github.example/u', description: 'd', version: '1.0.0', repository: { url } },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active', publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      },
    },
  } as unknown as RegistryEntry);
  // repositoryUrl qualifies every package identity key, so a value the two implementations
  // disagree about flips an admitted-drop decision.
  assert.equal(normalize(entry('ftp://a.com/x')).repositoryUrl, undefined);
  assert.equal(normalize(entry('javascript:alert(1)')).repositoryUrl, undefined);
  assert.equal(normalize(entry('http://a .com')).repositoryUrl, undefined, 'space in host');
  assert.equal(normalize(entry('http://a.com:99999/')).repositoryUrl, undefined, 'bad port');
  assert.equal(normalize(entry('https://github.com/a/b')).repositoryUrl, 'https://github.com/a/b');
  // WHATWG special-scheme slash collapsing: this HAS a host and must be kept.
  assert.equal(normalize(entry('http:evil')).repositoryUrl, 'http:evil');
});
