// One-shot script: fetch the full registry and save as data/snapshot.json
// Run: node scripts/fetch-snapshot.mjs
import fs from 'node:fs/promises';

const BASE = 'https://registry.modelcontextprotocol.io/v0/servers';
const all = [];
let cursor = undefined;
let page = 0;

while (true) {
  const url = new URL(BASE);
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
  const json = await res.json();
  all.push(...json.servers);
  page++;
  process.stdout.write(`\rPage ${page}: total ${all.length} entries`);
  cursor = json.metadata?.nextCursor;
  if (!cursor) break;
  if (page > 100) { console.error('\nSafety break at 100 pages'); break; }
}
console.log(`\nTotal raw entries (incl. all versions): ${all.length}`);

// Filter to latest version per server only
const latest = all.filter(e => e._meta?.['io.modelcontextprotocol.registry/official']?.isLatest);
console.log(`Latest-version servers: ${latest.length}`);

const snapshot = {
  fetchedAt: new Date().toISOString(),
  totalEntries: all.length,
  servers: latest,
};
await fs.writeFile('data/snapshot.json', JSON.stringify(snapshot, null, 2));
console.log(`Wrote data/snapshot.json (${(JSON.stringify(snapshot).length / 1024 / 1024).toFixed(2)} MB)`);
