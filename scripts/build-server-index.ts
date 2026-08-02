// Emit data/server-index.json — the pre-computed output of the loadServers() pipeline.
//
// WHY THIS EXISTS. A cold run of that pipeline costs ~2.2s IN PRODUCTION (measured
// 2026-08-02: ~1.0s to read + zod-parse 26MB of snapshot.json, ~1.2s for
// normalize/mergeAdmitted/dedupe/disambiguateSlugs over ~19.4k rows; a local M-series box is
// ~6x faster, so local numbers mislead). Next.js forces a full dynamic render for bot
// User-Agents whether or not a page is prerendered — base-server.js:1039,
// `supportsDynamicResponse: !this.renderOpts.botType` — and a bot request does NOT populate
// the edge cache. On ~19.4k tail pages whose only visitor is a crawler, that ~2.2s is
// therefore paid on essentially every crawl, and GSC shows crawl rate collapsing as response
// time rises. This file turns that into a plain JSON.parse.
//
// IT MUST GO THROUGH `loadServersFromSnapshot()`, NEVER `loadServers()`. The latter prefers
// this artifact, so calling it here would read our own output and re-emit it — self-
// perpetuating and undetectable. Same rule as scripts/build-slugmap.ts and for the same
// reason: a second implementation of the pipeline (or a circular one) is the disease, not
// the cure.
//
//   npx tsx --conditions=react-server scripts/build-server-index.ts
//
// Invoked automatically by scripts/sync-registry.mjs so the index is always written from,
// and committed alongside, the snapshot it binds to.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  loadServersFromSnapshot,
  loadSnapshot,
  readBundledSnapshot,
  resolveDeprecatedServers,
  SERVER_INDEX_SCHEMA_VERSION,
} from '../lib/registry';
import type { ServerIndexArtifact } from '../lib/registry';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'server-index.json');

// Imported, never redeclared. A local copy is how the writer and the reader drift: bump the
// reader alone and every artifact is rejected forever, silently dropping the site back to
// the ~2.2s pipeline with a console.error as the only signal.

/** sha256 of a file's bytes, or null when it does not exist. */
async function digest(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(file)).digest('hex');
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') return null;
    throw e;
  }
}

export async function buildServerIndex(): Promise<ServerIndexArtifact> {
  // Artifact-blind by construction — see the header.
  const servers = await loadServersFromSnapshot();
  const bundled = await readBundledSnapshot();
  const snap = await loadSnapshot();

  if (servers.length === 0) {
    throw new Error('refusing to write an empty server index');
  }

  // Same activeSlugs the runtime would have passed: deprecated slugs are resolved so they can
  // never alias a live subject.
  const deprecated = resolveDeprecatedServers(snap.servers, new Set(servers.map((s) => s.slug)));

  const [snapshot_sha256, admitted_sha256] = await Promise.all([
    digest(path.join(DATA, 'snapshot.json')),
    digest(path.join(DATA, 'admitted.json')),
  ]);

  // ORDER IS PRESERVED EXACTLY. Do NOT sort this array. Pipeline order is semantically
  // load-bearing: the server page's Alternatives block walks a registry-order successor
  // (cyclic per category), and app/sitemap.ts emits server routes in this order. Sorting
  // would silently move every one of those. Byte-stability comes from the pipeline being
  // deterministic — withDisambiguator is pure, both dedupe passes are first-wins over a
  // fixed input order, and lib/slugmapArtifact.test.ts already pins that property.
  //
  // No generatedAt / timestamp field, matching build-slugmap.ts: the input digests carry
  // identity, and a timestamp would make every sync look like a change.
  const doc: ServerIndexArtifact = {
    schema_version: SERVER_INDEX_SCHEMA_VERSION,
    inputs: { snapshot_sha256, admitted_sha256 },
    // snapshot_version and snapshot_written_at are NOT decorative. loadSnapshotMeta() serves
    // them from here, and app/sitemap.ts keys its baseCache on the version — without them the
    // sitemap would still pull the full 26MB parse on every render and the artifact would buy
    // the crawler's own entry point nothing.
    meta: {
      snapshot_version: bundled.snapshot_version,
      snapshot_written_at: bundled.snapshot_written_at,
      fetched_at: snap.fetchedAt,
    },
    counts: {
      servers: servers.length,
      total_entries: snap.totalEntries,
      deprecated: deprecated.length,
    },
    servers,
    // Precomputed so getServer()'s miss branch never reads raw RegistryEntry rows. That was
    // the last 26MB parse left on the request path, and it landed on whichever visitor first
    // hit an unknown slug on a fresh isolate — on a route exempt from the per-IP limiter.
    deprecated,
  };

  // Compact, not pretty-printed. This is a ~14MB derived blob that is regenerated wholesale;
  // a readable `git diff` is not achievable at that size and pretty-printing would roughly
  // double it in every deployment bundle. (build-slugmap.ts sorts for diff readability
  // precisely because it is small enough for that to be useful. This one is not.)
  await fs.writeFile(OUT, JSON.stringify(doc));
  return doc;
}

// Only when run directly, so buildServerIndex() stays importable by the test. `.then` rather
// than top-level await: tsx transforms this to CJS, which has none. (Same shape as
// scripts/build-slugmap.ts.)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  buildServerIndex().then(async (doc) => {
    const bytes = (await fs.stat(OUT)).size;
    console.log(
      `server-index: ${doc.counts.servers} servers, ${(bytes / 1048576).toFixed(1)}MB, ` +
        `bound to snapshot ${doc.meta.snapshot_version}`,
    );
    // Same floor, and the same reasoning, as build-slugmap.ts: an index built from a partial
    // fetch silently drops thousands of servers, and because loadServers() PREFERS this file
    // the site would then serve a truncated catalog while snapshot.json sat there complete.
    // Loud and non-zero before anything is committed.
    if (doc.counts.servers < 14000) {
      console.error(
        `::error::server-index has only ${doc.counts.servers} servers (expected ~19k). ` +
          `Refusing — this is a partial snapshot, and loadServers() prefers this file, so ` +
          `shipping it would serve a truncated catalog.`,
      );
      process.exit(1);
    }
  });
}
