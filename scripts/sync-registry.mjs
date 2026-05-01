#!/usr/bin/env node
// Production cron entry. Pulls full registry, writes data/snapshot.json + a
// dated snapshot to data/snapshots/. Run via Vercel cron (vercel.json) or any
// scheduler. Idempotent — safe to re-run.
//
//   node scripts/sync-registry.mjs

import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://registry.modelcontextprotocol.io/v0/servers';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SNAP_PATH = path.join(ROOT, 'data', 'snapshot.json');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');

await fs.mkdir(SNAP_DIR, { recursive: true });

const all = [];
let cursor;
let page = 0;
const MAX_PAGES = 500;

while (page < MAX_PAGES) {
  const url = new URL(BASE);
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Page ${page} failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const json = await res.json();
  all.push(...json.servers);
  page++;
  process.stdout.write(`\rPage ${page}: ${all.length} entries`);
  cursor = json.metadata?.nextCursor;
  if (!cursor) break;
}
console.log(`\nTotal raw entries: ${all.length}`);

const latest = all.filter(
  (e) => e._meta?.['io.modelcontextprotocol.registry/official']?.isLatest,
);
console.log(`Latest-version servers: ${latest.length}`);

const snapshot = {
  fetchedAt: new Date().toISOString(),
  totalEntries: all.length,
  servers: latest,
};
const day = new Date().toISOString().slice(0, 10);

await Promise.all([
  fs.writeFile(SNAP_PATH, JSON.stringify(snapshot, null, 2)),
  fs.writeFile(
    path.join(SNAP_DIR, `${day}.json`),
    JSON.stringify(snapshot, null, 2),
  ),
]);

console.log(`Wrote ${SNAP_PATH}`);
console.log(`Wrote ${SNAP_DIR}/${day}.json`);
