// Slug identity: slugify is lossy; disambiguateSlugs must keep public slugs injective.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { disambiguateSlugs, findDeprecatedServer, slugify } from './registry';
import type { IndexedServer, RegistryEntry } from './types';

function stub(name: string): IndexedServer {
  return {
    slug: slugify(name),
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
