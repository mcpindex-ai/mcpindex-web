// The committed data/slugmap.json is the contract mcpindex-trust will key every verdict by.
//
// These assertions are deliberately against the FILE ON DISK, not against the builder's own
// output. Comparing the builder to its own source would be tautological. It must also NOT use
// `loadServers()`, which prefers data/server-index.json: that would compare one committed
// artifact against another and stop touching the snapshot entirely (measured: zero pipeline
// runs). The risk worth testing is that the committed artifact has gone stale
// relative to the snapshot beside it, which is exactly what happens when a sync writes one
// file and not the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { buildSlugMap } from '../scripts/build-slugmap';
import { loadServersFromSnapshot } from './registry';

const DATA = path.join(process.cwd(), 'data');

type SlugMap = {
  schema_version: string;
  inputs: { snapshot_sha256: string | null; admitted_sha256: string | null };
  counts: { servers: number; retired: number };
  servers: Record<string, string>;
  retired: string[];
};

const raw = readFileSync(path.join(DATA, 'slugmap.json'), 'utf8');
const doc = JSON.parse(raw) as SlugMap;

test('the committed artifact matches what the snapshot pipeline computes right now', async () => {
  const servers = await loadServersFromSnapshot();
  const expected = Object.fromEntries(servers.map((s) => [s.name, s.slug]));
  assert.deepEqual(
    doc.servers,
    expected,
    'data/slugmap.json is stale — regenerate with `npx tsx --conditions=react-server scripts/build-slugmap.ts`',
  );
});

test('the input digests bind the artifact to the files beside it', () => {
  // This is the whole safety property. A map that does not bind to its snapshot is a map
  // that can silently key every verdict wrong after the next sync.
  for (const [file, got] of [
    ['snapshot.json', doc.inputs.snapshot_sha256],
    ['admitted.json', doc.inputs.admitted_sha256],
  ] as const) {
    const want = createHash('sha256').update(readFileSync(path.join(DATA, file))).digest('hex');
    assert.equal(got, want, `${file} digest is stale in data/slugmap.json`);
  }
});

test('retired lists every base slug no server holds, and nothing else', async () => {
  const servers = await loadServersFromSnapshot();
  const held = new Set(servers.map((s) => s.slug));
  const want = [...new Set(servers.map((s) => s.baseSlug))].filter((b) => !held.has(b)).sort();
  assert.deepEqual(doc.retired, want);
  // A retired slug that some server still holds would make the screener's purge delete a
  // live verdict — the exact harm three rounds of review kept finding.
  for (const slug of doc.retired) {
    assert.ok(!held.has(slug), `${slug} is retired but a server still holds it`);
  }
});

test('the artifact is byte-stable across rebuilds', async () => {
  // Determinism is what makes `git diff data/slugmap.json` a usable review artifact on a
  // keying change: the only lines that move are the slugs that moved. A timestamp or an
  // unsorted key order would make every sync look like a change and hide the real one.
  const a = await buildSlugMap();
  const b = await buildSlugMap();
  assert.equal(a, b, 'two builds differ — the output is not deterministic');
  assert.equal(a, raw, 'the committed file differs from a fresh build');
});

test('keys are sorted, so a git diff shows only the slugs that actually moved', () => {
  // Determinism alone does not give this: a reversed map is perfectly deterministic, and
  // `deepEqual` ignores key order, so both of those tests passed against an unsorted build.
  // Sortedness is what makes `git diff data/slugmap.json` readable on a keying change — the
  // review artifact that justified having no timestamp in the file.
  const names = Object.keys(doc.servers);
  const sorted = [...names].sort();
  const firstDrift = names.findIndex((n, i) => n !== sorted[i]);
  assert.equal(
    firstDrift,
    -1,
    firstDrift === -1 ? '' : `keys are not sorted; first drift at ${firstDrift}: ${names[firstDrift]}`,
  );
  assert.deepEqual(doc.retired, [...doc.retired].sort(), 'retired must be sorted too');
});

test('counts agree with the payload, and the corpus is not truncated', () => {
  assert.equal(doc.counts.servers, Object.keys(doc.servers).length);
  assert.equal(doc.counts.retired, doc.retired.length);
  // The sync workflow refuses a snapshot under 14,000 entries; a map built from a partial
  // fetch is worse than a partial snapshot, because an absent name reads as "not in the
  // catalog" and those servers stop being screened rather than being mis-keyed.
  assert.ok(doc.counts.servers >= 14000, `only ${doc.counts.servers} servers`);
});

test('every slug is unique — the map must be injective', () => {
  // The screener keys by slug. Two names sharing one means one subject's verdict renders
  // under the other's name, which the decision log calls defamation-class.
  const slugs = Object.values(doc.servers);
  assert.equal(new Set(slugs).size, slugs.length, 'two names share a slug');
});
