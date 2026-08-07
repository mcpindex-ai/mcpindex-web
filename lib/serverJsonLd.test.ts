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
    source: 'registry',
    slug: 'x',
    baseSlug: 'x',
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
    null,
  );
  assert.equal(ld['@type'], 'SoftwareSourceCode');
  assert.equal(ld.codeRepository, 'https://github.com/acme/x');
  assert.equal(ld.runtimePlatform, 'Node.js');
  assert.deepEqual(collectTypes(ld).filter((t) => APP_FAMILY.has(t)), []);
});

test('remote-only server → WebAPI, no app-family type', () => {
  const ld = buildServerJsonLd(
    makeServer({ remoteUrl: 'https://api.example.com/mcp', hasRemote: true }),
    null,
  );
  assert.equal(ld['@type'], 'WebAPI');
  assert.deepEqual(collectTypes(ld).filter((t) => APP_FAMILY.has(t)), []);
});

test('server with neither repo nor remote → WebPage', () => {
  const ld = buildServerJsonLd(makeServer({}), null);
  assert.equal(ld['@type'], 'WebPage');
});

test('unsafe repo scheme is dropped, falls through to next shape', () => {
  // javascript: URL must not become codeRepository nor a SoftwareSourceCode node.
  const ld = buildServerJsonLd(
    makeServer({ repositoryUrl: 'javascript:alert(1)', remoteUrl: 'https://api.example.com/mcp' }),
    null,
  );
  assert.equal(ld['@type'], 'WebAPI');
  assert.ok(!JSON.stringify(ld).includes('javascript:'));
});

test('runtimePlatform derived only from recorded packaging', () => {
  assert.equal(
    buildServerJsonLd(makeServer({ repositoryUrl: 'https://github.com/a/b', pypiPackage: 'b' }), null)
      .runtimePlatform,
    'Python',
  );
  // No package recorded → property omitted entirely, never guessed.
  const ld = buildServerJsonLd(makeServer({ repositoryUrl: 'https://github.com/a/b' }), null);
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
    const ld = buildServerJsonLd(s, null);
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

// --- source liveness in the machine-readable block ---------------------------------
// The visible banner and the meta description already carry this fact. This block is a
// third surface and, per the comment in serverJsonLd.ts, the ONLY one an answer engine
// reads — so the same fact has to survive here or the page tells machines something the
// page tells humans is false.

const DEAD: import('./sourceLiveness').SourceLiveness = {
  state: 'unavailable',
  url: 'https://github.com/acme/x',
  last_verified_accessible: null,
  confirmed_unavailable: '2026-07-23',
  evidence: { http_status: 404, vantages: 2, methods: ['github-api', 'github-web'] },
};

test('unreachable repo is withdrawn from sameAs but retained as codeRepository', () => {
  const s = makeServer({ repositoryUrl: 'https://github.com/acme/x', websiteUrl: 'https://acme.dev' });
  const ld = buildServerJsonLd(s, DEAD);

  // sameAs asserts identity equivalence; a 404 indicates nothing, so it goes.
  assert.deepEqual(ld.sameAs, ['https://acme.dev']);
  // codeRepository is what the registry DECLARES. We annotate, we do not edit.
  assert.equal(ld.codeRepository, 'https://github.com/acme/x');
  assert.equal(ld['@type'], 'SoftwareSourceCode');
});

test('reachable repo keeps its sameAs entry', () => {
  const s = makeServer({ repositoryUrl: 'https://github.com/acme/x', websiteUrl: 'https://acme.dev' });
  const ld = buildServerJsonLd(s, null);
  assert.deepEqual(ld.sameAs, ['https://github.com/acme/x', 'https://acme.dev']);
});

test('creativeWorkStatus states the observation and keeps the hedge', () => {
  const status = String(
    buildServerJsonLd(makeServer({ repositoryUrl: 'https://github.com/acme/x' }), DEAD)
      .creativeWorkStatus,
  );
  assert.match(status, /not a safety verdict/);
  assert.match(status, /not publicly accessible \(HTTP 404, 2 independent vantages, confirmed 2026-07-23\)/);
  assert.match(status, /may be private or relocated/);
  // Never the inference. A 404 cannot distinguish deleted from deliberately private,
  // and this string is a public statement about a third party's work.
  for (const banned of [/\bdead\b/i, /\bgone\b/i, /\babandoned\b/i, /\bdeleted\b/i]) {
    assert.doesNotMatch(status, banned);
  }
});

test('unflagged listings carry no reachability claim at all', () => {
  const status = String(buildServerJsonLd(makeServer({}), null).creativeWorkStatus);
  // Absence of evidence must not render as "reachable" — there is simply nothing to say.
  assert.doesNotMatch(status, /accessible|reachab/i);
});
