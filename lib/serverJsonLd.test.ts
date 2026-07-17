import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServerJsonLd } from './serverJsonLd';
import { loadServers } from './registry';
import type { IndexedServer } from './types';

// Types that put a page into Google's rich-result programs with a required user
// rating we cannot honestly supply. None may appear at ANY nesting depth.
const APP_FAMILY = new Set([
  'SoftwareApplication',
  'WebApplication',
  'MobileApplication',
  'VideoGame',
  'Product',
]);

// Recursively collect every @type value anywhere in the graph (nested nodes and arrays).
function collectTypes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const v of node) collectTypes(v, out);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === '@type') {
        if (Array.isArray(v)) out.push(...(v as string[]));
        else if (typeof v === 'string') out.push(v);
      } else {
        collectTypes(v, out);
      }
    }
  }
  return out;
}

function makeServer(over: Partial<IndexedServer>): IndexedServer {
  return {
    slug: 'x',
    name: 'ns/x',
    title: 'X',
    description: 'desc',
    version: '1.0.0',
    category: 'other',
    publishedAt: '2026-01-01',
    updatedAt: '2026-01-01',
    status: 'active',
    hasRemote: false,
    hasPackage: false,
    primaryTransport: null,
    envVars: [],
    ...over,
  };
}

test('repo-backed server → SoftwareSourceCode, no app-family type', () => {
  const ld = buildServerJsonLd(
    makeServer({ repositoryUrl: 'https://github.com/acme/x', npmPackage: 'x' }),
  );
  assert.equal(ld['@type'], 'SoftwareSourceCode');
  assert.equal(ld.codeRepository, 'https://github.com/acme/x');
  assert.equal(ld.runtimePlatform, 'Node.js');
  assert.deepEqual(collectTypes(ld).filter((t) => APP_FAMILY.has(t)), []);
});

test('remote-only server → WebAPI, no app-family type', () => {
  const ld = buildServerJsonLd(
    makeServer({ remoteUrl: 'https://api.example.com/mcp', hasRemote: true }),
  );
  assert.equal(ld['@type'], 'WebAPI');
  assert.deepEqual(collectTypes(ld).filter((t) => APP_FAMILY.has(t)), []);
});

test('server with neither repo nor remote → WebPage', () => {
  const ld = buildServerJsonLd(makeServer({}));
  assert.equal(ld['@type'], 'WebPage');
});

test('unsafe repo scheme is dropped, falls through to next shape', () => {
  // javascript: URL must not become codeRepository nor a SoftwareSourceCode node.
  const ld = buildServerJsonLd(
    makeServer({ repositoryUrl: 'javascript:alert(1)', remoteUrl: 'https://api.example.com/mcp' }),
  );
  assert.equal(ld['@type'], 'WebAPI');
  assert.ok(!JSON.stringify(ld).includes('javascript:'));
});

test('runtimePlatform derived only from recorded packaging', () => {
  assert.equal(
    buildServerJsonLd(makeServer({ repositoryUrl: 'https://github.com/a/b', pypiPackage: 'b' }))
      .runtimePlatform,
    'Python',
  );
  // No package recorded → property omitted entirely, never guessed.
  const ld = buildServerJsonLd(makeServer({ repositoryUrl: 'https://github.com/a/b' }));
  assert.equal('runtimePlatform' in ld, false);
});

// The real guard: every server in the live snapshot must render a graph with NO
// app-family @type at any depth, and must round-trip through JSON.
test('entire registry snapshot renders zero app-family types', async () => {
  const servers = await loadServers();
  assert.ok(servers.length > 1000, `expected a full snapshot, got ${servers.length}`);

  const seenShapes = new Set<string>();
  let offenders = 0;
  let firstOffender = '';
  for (const s of servers) {
    const ld = buildServerJsonLd(s);
    seenShapes.add(String(ld['@type']));
    const bad = collectTypes(ld).filter((t) => APP_FAMILY.has(t));
    if (bad.length) {
      offenders++;
      if (!firstOffender) firstOffender = `${s.slug}: ${bad.join(',')}`;
    }
    // JSON must round-trip (jsonLdSafe serializes it at render time).
    JSON.parse(JSON.stringify(ld));
  }

  assert.equal(offenders, 0, `${offenders} servers emit an app-family type; first: ${firstOffender}`);
  // All three shapes should be exercised by a real snapshot.
  for (const shape of ['SoftwareSourceCode', 'WebAPI', 'WebPage']) {
    assert.ok(seenShapes.has(shape), `expected snapshot to exercise ${shape}; saw ${[...seenShapes]}`);
  }
});
