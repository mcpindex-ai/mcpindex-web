// data/first-seen.json: the earliest registry publishedAt this repo has observed per server name.
//
// WHY IT EXISTS. The sync fetches version=latest, so data/snapshot.json carries one record per
// name and its publishedAt is the LATEST version's publish time. /api/v1/diff cannot tell a new
// server from a new release of an old one with that alone: a server that shipped 1.0 in June and
// 1.1 last week looks brand new. This file keeps, per name, the minimum publishedAt across every
// snapshot the sync has written, which is the publish time of the earliest version we saw.
//
// Merging is a per-name min, so it is order-independent and idempotent: re-running a sync, a
// rebase that replays one, or the git-history backfill (scripts/backfill-first-seen.mjs) can
// only move a date earlier, never later. Names that leave the registry are kept, so a name that
// comes back is not counted as new.
//
// observed_from is the earliest snapshot fetchedAt folded in. A name already present in that
// first snapshot is recorded with its latest version's date at the time, which can be later than
// its true first publish; /api/v1/diff states that limit for windows that start before it.

import fs from 'node:fs/promises';

const META = 'io.modelcontextprotocol.registry/official';

/** @returns {{ schema_version: 1, observed_from: string | null, servers: Record<string, string> }} */
export function emptyFirstSeen() {
  return { schema_version: 1, observed_from: null, servers: {} };
}

export async function readFirstSeen(file) {
  try {
    const doc = JSON.parse(await fs.readFile(file, 'utf8'));
    if (doc?.schema_version !== 1 || typeof doc.servers !== 'object' || doc.servers === null) {
      throw new Error(`${file}: unexpected shape`);
    }
    return doc;
  } catch (e) {
    if (e?.code === 'ENOENT') return emptyFirstSeen();
    throw e;
  }
}

/** Fold one snapshot into the doc in place. Returns how many names were new to it. */
export function mergeFirstSeen(doc, snapshot) {
  let added = 0;
  for (const e of snapshot.servers ?? []) {
    const name = e?.server?.name;
    const pub = e?._meta?.[META]?.publishedAt;
    if (typeof name !== 'string' || typeof pub !== 'string' || Number.isNaN(Date.parse(pub))) continue;
    const prev = doc.servers[name];
    if (prev === undefined) added++;
    if (prev === undefined || Date.parse(pub) < Date.parse(prev)) doc.servers[name] = pub;
  }
  const at = snapshot.fetchedAt;
  if (typeof at === 'string' && (doc.observed_from === null || Date.parse(at) < Date.parse(doc.observed_from))) {
    doc.observed_from = at;
  }
  return added;
}

/** One name per line, sorted, so a sync commit diffs as the names it added. */
export function serializeFirstSeen(doc) {
  const sorted = {};
  for (const k of Object.keys(doc.servers).sort()) sorted[k] = doc.servers[k];
  return JSON.stringify({ schema_version: 1, observed_from: doc.observed_from, servers: sorted }, null, 1) + '\n';
}
