// data/server-index.json is what loadServers() actually serves in production. These
// assertions are the ONLY thing binding it to the pipeline it claims to be a copy of.
//
// Read lib/registry.ts's block comment on SERVER_INDEX_PATH first. The short version: the
// runtime check is deliberately structural (schema_version, non-empty, counts agree) because
// verifying `inputs.snapshot_sha256` at request time would mean reading the very 26MB file
// the artifact exists to avoid. So the binding lives HERE, at build/test time. If these tests
// are ever weakened, a structurally-valid-but-wrong artifact can serve in production with a
// green suite — which is the precise failure this file exists to prevent.
//
// EVERY COMPARISON GOES THROUGH `loadServersFromSnapshot()`, NEVER `loadServers()`.
// loadServers() PREFERS the artifact, so comparing against it would be `assert(x === x)`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { loadServersFromSnapshot, readBundledSnapshot, validateServerIndex } from './registry';
import type { ServerIndexArtifact } from './registry';

const DATA = path.join(process.cwd(), 'data');

const doc = JSON.parse(
  readFileSync(path.join(DATA, 'server-index.json'), 'utf8'),
) as ServerIndexArtifact;

const REGEN = 'regenerate with `npx tsx --conditions=react-server scripts/build-server-index.ts`';

test('the committed artifact is byte-for-byte what the live pipeline computes right now', async () => {
  const servers = await loadServersFromSnapshot();
  // deepEqual here is deepSTRICTEqual (node:assert/strict), which distinguishes own-key
  // presence. That is why normalizeServer omits undefined-valued keys — without that, every
  // row differed from its JSON round-trip and this assertion could not be written honestly.
  assert.deepEqual(doc.servers, servers, `data/server-index.json is stale — ${REGEN}`);
});

test('ORDER is preserved, not just membership', async () => {
  // Pipeline order is semantically load-bearing: the server page's Alternatives block walks a
  // registry-order successor (cyclic per category) and app/sitemap.ts emits in this order. A
  // sorted artifact would pass a set-comparison and silently move every one of those.
  const servers = await loadServersFromSnapshot();
  assert.deepEqual(
    doc.servers.map((s) => s.slug),
    servers.map((s) => s.slug),
    `server-index order diverges from the pipeline — ${REGEN}`,
  );
});

test('the input digests bind the artifact to the files beside it', () => {
  // The whole safety property. An index that does not bind to its snapshot is an index that
  // serves a stale catalog after the next sync, and because loadServers() PREFERS it, the
  // complete snapshot.json sitting next to it would never be read.
  for (const [file, got] of [
    ['snapshot.json', doc.inputs.snapshot_sha256],
    ['admitted.json', doc.inputs.admitted_sha256],
  ] as const) {
    const want = createHash('sha256').update(readFileSync(path.join(DATA, file))).digest('hex');
    assert.equal(got, want, `${file} digest is stale in data/server-index.json — ${REGEN}`);
  }
});

test('the meta header matches the snapshot, so loadSnapshotMeta can be served from it', async () => {
  // Not decorative: app/sitemap.ts keys its baseCache on `version`, and lib/llmsFullCache on
  // the same value. A wrong version here means a sitemap cache that never invalidates, or one
  // that invalidates on every render.
  const bundled = await readBundledSnapshot();
  assert.equal(doc.meta.snapshot_version, bundled.snapshot_version, `stale meta.snapshot_version — ${REGEN}`);
  assert.equal(doc.meta.snapshot_written_at, bundled.snapshot_written_at, `stale meta.snapshot_written_at — ${REGEN}`);
  assert.equal(doc.meta.fetched_at, bundled.fetchedAt, `stale meta.fetched_at — ${REGEN}`);
  assert.equal(doc.counts.total_entries, bundled.totalEntries, `stale counts.total_entries — ${REGEN}`);
});

test('counts agree with the payload (this is the runtime check; prove it holds)', () => {
  assert.equal(doc.counts.servers, doc.servers.length);
  assert.equal(doc.schema_version, '1');
  assert.ok(doc.servers.length > 14000, `only ${doc.servers.length} servers — partial snapshot?`);
});

test('slugs agree with data/slugmap.json', () => {
  // Cross-check between two INDEPENDENTLY COMMITTED artifacts. Both derive from
  // loadServersFromSnapshot(), so this cannot catch a pipeline bug — it catches the thing
  // that actually happens: one file regenerated and the other not, which is exactly the
  // stale-pair state scripts/sync-registry.mjs and the rebase-conflict resolver exist to
  // prevent. Slug identity is where being wrong means a wrong-subject verdict PASS.
  const map = JSON.parse(readFileSync(path.join(DATA, 'slugmap.json'), 'utf8')) as {
    servers: Record<string, string>;
  };
  const fromIndex = Object.fromEntries(doc.servers.map((s) => [s.name, s.slug]));
  assert.deepEqual(fromIndex, map.servers, `server-index and slugmap disagree on slugs — regenerate BOTH`);
});

test('slugs are unique — a shared slug is a wrong-subject verdict', () => {
  const slugs = new Set(doc.servers.map((s) => s.slug));
  assert.equal(slugs.size, doc.servers.length, 'two servers share a public slug in the artifact');
});

// ---------------------------------------------------------------------------------------
// The property with no coverage before: that loadServers() SERVES the artifact.
//
// Every test above reads the file with readFileSync and never exercises the loader. Delete
// data/server-index.json, or ship a deploy where the file is not traced into the bundle, and
// all 44 lib suites still pass while production silently pays the ~2.2s pipeline per crawl.
// Reference equality is the exact property, and it needs no timing.
test('loadServers() serves the artifact rather than recomputing', async () => {
  const { loadServers, loadServerIndexForTest } = await import('./registry');
  const idx = await loadServerIndexForTest();
  assert.ok(idx, 'server-index was absent or REJECTED — loadServers() is falling back');
  assert.equal(
    await loadServers(),
    idx.servers,
    'loadServers() did not return the artifact array — it recomputed the pipeline',
  );
});

// The rejection branches. These are the "degrade, do not 500" promise; before this they had
// no coverage at all, and one of them (duplicate slug) is the wrong-subject failure mode.
// A 3-row VALID artifact. counts must track the slice or every case would trip the counts
// check first and the assertions would all pass for the wrong reason.
const base = () => {
  const d = JSON.parse(JSON.stringify({ ...doc, servers: doc.servers.slice(0, 3) }));
  d.counts.servers = d.servers.length;
  return d;
};
const withCount = (d: ReturnType<typeof base>) => ((d.counts.servers = d.servers.length), d);

test('validateServerIndex rejects the artifacts that matter', () => {
  const cases: Array<[string, () => unknown]> = [
    ['not an object', () => null],
    ['schema_version', () => ({ ...base(), schema_version: '2' })],
    ['servers missing or empty', () => withCount(Object.assign(base(), { servers: [] }))],
    ['counts.servers', () => Object.assign(base(), { counts: { servers: 999, total_entries: 1 } })],
    ['meta incomplete', () => Object.assign(base(), { meta: { snapshot_version: '', snapshot_written_at: '', fetched_at: '' } })],
    ['a row is not an object', () => { const d = base(); d.servers[1] = null; return d; }],
    // The one that renders one server's verdict under another's name.
    ['duplicate slug', () => { const d = base(); d.servers[1].slug = d.servers[0].slug; return d; }],
    ['bad slug shape', () => { const d = base(); d.servers[0].slug = 'a"><script>'; return d; }],
    ['non-array envVars', () => { const d = base(); d.servers[0].envVars = 'nope'; return d; }],
    // safeUrl() no longer runs on artifact rows; this is what replaces it.
    ['non-http remoteUrl', () => { const d = base(); d.servers[0].remoteUrl = 'javascript:alert(1)'; return d; }],
  ];
  for (const [label, make] of cases) {
    const res = validateServerIndex(make());
    assert.ok('reason' in res, `expected rejection for: ${label}`);
    assert.match(res.reason, new RegExp(label.split(' ')[0]!, 'i'), `wrong reason for ${label}: ${res.reason}`);
  }
});

test('validateServerIndex accepts the real committed artifact', () => {
  const res = validateServerIndex(doc);
  assert.ok('ok' in res, `real artifact rejected: ${'reason' in res ? res.reason : ''}`);
});
