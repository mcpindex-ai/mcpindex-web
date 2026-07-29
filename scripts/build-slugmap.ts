// Emit data/slugmap.json — the authoritative `name -> public slug` map.
//
// WHY THIS EXISTS. mcpindex-trust keys every verdict in the store by a server's public slug,
// and until now it re-derived that slug with a second, hand-written implementation of this
// repo's pipeline (`corpus_eval/tooling/slug_identity.py`, ~960 lines). Three rounds of
// adversarial review found thirteen HIGH defects in that arrangement and every one of them
// was a divergence between the two implementations, or a bug in code that exists only to
// mirror this one. A divergence keys a verdict at a slug this site never serves, or deletes
// one it is still serving.
//
// So: this side computes the answer once, publishes it, and the screener looks it up.
//
// It MUST go through `loadServers()`. Recomputing the pipeline here — even "just the slug
// part" — would make three implementations instead of two, which is the disease rather than
// the cure. `loadServers` reads only the bundled snapshot (no KV, no network), so this runs
// offline from the repo root.
//
//   npx tsx --conditions=react-server scripts/build-slugmap.ts
//
// Invoked automatically by scripts/sync-registry.mjs so the map is always written from, and
// committed alongside, the snapshot it binds to.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { loadServers } from '../lib/registry';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const DATA = path.join(ROOT, 'data');
const OUT = path.join(DATA, 'slugmap.json');

/** sha256 of a file's bytes, or null when it does not exist. */
async function digest(file: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await fs.readFile(file)).digest('hex');
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') return null;
    throw e;
  }
}

export async function buildSlugMap(): Promise<string> {
  const servers = await loadServers();

  // Sorted, so the output is byte-stable across runs and `git diff data/slugmap.json` on a
  // keying change shows exactly which slugs moved. That review artifact is the reason there
  // is no generatedAt field — the input digests carry identity, a timestamp would only make
  // every sync look like a change.
  const byName: Record<string, string> = {};
  for (const s of [...servers].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    byName[s.name] = s.slug;
  }

  // A base slug that no server holds as its FINAL slug. Two names collided onto it, both were
  // disambiguated, and it now addresses nobody — so a verdict left there is keyed to no
  // subject. The screener's purge needs this set and cannot compute it without knowing the
  // whole catalog, which is precisely what it is losing the ability to do.
  const held = new Set(servers.map((s) => s.slug));
  const retired = [...new Set(servers.map((s) => s.baseSlug))].filter((b) => !held.has(b)).sort();

  const doc = {
    schema_version: '1',
    // The BINDING. The screener recomputes these against the files it is about to use and
    // refuses to write store keys if they disagree, because a stale map mis-keys everything.
    inputs: {
      snapshot_sha256: await digest(path.join(DATA, 'snapshot.json')),
      admitted_sha256: await digest(path.join(DATA, 'admitted.json')),
    },
    counts: { servers: servers.length, retired: retired.length },
    servers: byName,
    retired,
  };
  return JSON.stringify(doc, null, 2) + '\n';
}

export async function writeSlugMap(): Promise<{ path: string; servers: number; retired: number }> {
  const blob = await buildSlugMap();
  await fs.writeFile(OUT, blob);
  const parsed = JSON.parse(blob) as { counts: { servers: number; retired: number } };
  return { path: OUT, servers: parsed.counts.servers, retired: parsed.counts.retired };
}

// Only when run directly, so the functions above stay importable by the test. `.then` rather
// than top-level await: tsx transforms this to CJS, which has none.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  writeSlugMap().then((r) => {
    console.log(`Wrote ${r.path} (${r.servers} servers, ${r.retired} retired)`);
    // A slug map built from a partial fetch silently drops thousands of names, and the
    // screener reads an absent name as "not in the catalog" — so those servers stop being
    // screened rather than being mis-keyed. Loud, and non-zero, before anything is committed.
    if (r.servers < 14000) {
      console.error(
        `::error::slugmap has only ${r.servers} servers (expected ~18.7k). Refusing — this ` +
          `is a partial snapshot, and shipping it would silently drop the tail from screening.`,
      );
      process.exit(1);
    }
  });
}
