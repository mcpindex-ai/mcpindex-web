#!/usr/bin/env node
// Production cron entry. Pulls full registry, writes data/snapshot.json + a
// dated snapshot to data/snapshots/. Run via Vercel cron (vercel.json) or any
// scheduler. Idempotent - safe to re-run.
//
//   node scripts/sync-registry.mjs

import fs from 'node:fs/promises';
import path from 'node:path';

// Overridable so the stall/retry behaviour can be exercised against a stub upstream
// (see the verification in tasks/lessons.md 2026-07-20). Production passes neither.
const BASE = process.env.SYNC_REGISTRY_BASE ?? 'https://registry.modelcontextprotocol.io/v0/servers';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SNAP_PATH = path.join(ROOT, 'data', 'snapshot.json');
const SNAP_DIR = path.join(ROOT, 'data', 'snapshots');

await fs.mkdir(SNAP_DIR, { recursive: true });

// The upstream registry is cursor-paginated at a hard limit=100 and has become
// intermittently slow (individual pages have been observed taking 10s+). A single
// `fetch` with no timeout + `process.exit(1)` on the first blip meant one slow or
// flaky page aborted the whole ~160-page run and discarded everything already
// fetched — which, combined with the 10-min CI timeout, is why daily syncs started
// silently failing. Fetch each page with a per-request timeout and bounded retries
// so a transient stall no longer kills the run.
// The upstream intermittently stalls a single page HARD (observed 2026-07-19: page 12
// exceeded 30s on all 4 retries and aborted the whole run, though manual runs minutes
// apart completed fine). Be patient: a genuinely-slow page gets 60s, and a transient
// stall gets 6 backoff'd retries (up to ~64s apart) to let the upstream recover before
// we fail-closed. Worst case per stuck page ~6-8min, well within the 120min CI ceiling;
// only a truly-dead upstream (all 7 attempts fail) throws and refuses to ship partial.
const PAGE_TIMEOUT_MS = Number(process.env.SYNC_PAGE_TIMEOUT_MS ?? 60_000);
const PAGE_RETRIES = Number(process.env.SYNC_PAGE_RETRIES ?? 6);

// GLOBAL ceiling, below the workflow's timeout-minutes. Without this the script cannot
// self-terminate: during a bad upstream window (measured 2026-07-20 at 15s/page, i.e.
// ~135min for the full fetch) it simply crawls until CI kills it at exactly 60m00s.
// A CI kill surfaces as "cancelled" - indistinguishable from a human cancel, and it
// reads as benign, which is why these runs went unnoticed from ~2026-07-08 to 07-20.
// Exiting on our own deadline makes the same event a RED failure with a diagnostic.
const RUN_DEADLINE_MS = Number(process.env.SYNC_DEADLINE_MS ?? 45 * 60_000);
const startedAt = Date.now();
const elapsed = () => Date.now() - startedAt;

async function fetchPage(cursor) {
  const url = new URL(BASE);
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);
  let lastErr;
  for (let attempt = 0; attempt <= PAGE_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (attempt < PAGE_RETRIES) {
        const backoff = 1000 * 2 ** attempt; // 1s, 2s, 4s, 8s
        process.stdout.write(`\n  page fetch failed (${e.message}); retry ${attempt + 1}/${PAGE_RETRIES} in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw new Error(`page fetch exhausted retries: ${lastErr?.message ?? lastErr}`);
}

const all = [];
let cursor;
let page = 0;
// Headroom well above the real registry size (~542 pages / 54k raw records as of
// 2026-07-18). This is a runaway guard, NOT a size limit: hitting it is treated as a
// hard failure below (never ship a truncated snapshot). Raise it if the registry ever
// legitimately approaches this many pages.
const MAX_PAGES = 2000;

while (page < MAX_PAGES) {
  if (elapsed() > RUN_DEADLINE_MS) {
    const rate = (elapsed() / 1000 / Math.max(page, 1)).toFixed(1);
    console.error(
      `\n::error::Registry sync gave up: ${Math.round(elapsed() / 1000)}s elapsed at page ${page} ` +
        `(${all.length} entries, ${rate}s/page) with a remaining cursor. A good window runs ~0.08s/page ` +
        `and finishes in under 5min, so this window is too slow to finish. Refusing to write a partial ` +
        `snapshot; the next 4h run will try a fresh window.`,
    );
    process.exit(1);
  }
  const json = await fetchPage(cursor);
  all.push(...json.servers);
  page++;
  // A \r-only progress line collapses the ENTIRE fetch into one log line carrying a
  // single timestamp, which is exactly why the stalls above could not be located in
  // time. Flush a real, timestamped line periodically so the next stall is one
  // `grep` away; keep the \r line for local runs where it reads nicely.
  process.stdout.write(`\rPage ${page}: ${all.length} entries`);
  if (page % 25 === 0) {
    console.log(`\n[${new Date().toISOString()}] page ${page}, ${all.length} entries, ${Math.round(elapsed() / 1000)}s elapsed`);
  }
  cursor = json.metadata?.nextCursor;
  if (!cursor) break;
}
console.log(`\nTotal raw entries: ${all.length}`);

// If we stopped because of the page cap while the registry still had a cursor, the
// snapshot is TRUNCATED — servers past the cap would be silently missing (this exact bug
// dropped ~1,445 latest servers when the cap was 500). Refuse to write a truncated
// snapshot: fail HARD so CI goes red and the previous good snapshot stays live, rather
// than silently deploying a partial directory. Raise MAX_PAGES (and the CI timeout if
// needed) when this fires.
if (cursor) {
  console.error(
    `::error::Registry sync hit MAX_PAGES=${MAX_PAGES} (${all.length} raw entries) with a ` +
      `remaining cursor — snapshot would be TRUNCATED. Refusing to write. Raise MAX_PAGES.`,
  );
  process.exit(1);
}

const latest = all.filter(
  (e) => e._meta?.['io.modelcontextprotocol.registry/official']?.isLatest,
);
console.log(`Latest-version servers: ${latest.length}`);

// Repair classic Windows-1252 double-encoding mojibake in registry descriptions/titles
// (e.g. an em dash "—" arriving as "â€”"). ~31 source records carry this; it surfaces
// verbatim in the public search API and MCP search tool. The map is intentionally
// conservative — it only rewrites unambiguous garbage sequences, never valid text.
const MOJIBAKE = [
  // Windows-1252 family ("\u00E2\u20AC\u2026") — lead byte 0xE2 decodes to "\u00E2"
  ['\u00E2\u20AC\u201D', '\u2014'], // em dash
  ['\u00E2\u20AC\u201C', '\u2013'], // en dash
  ['\u00E2\u20AC\u2122', '\u2019'], // right single quote
  ['\u00E2\u20AC\u02DC', '\u2018'], // left single quote
  ['\u00E2\u20AC\u0153', '\u201C'], // left double quote
  ['\u00E2\u20AC\u00A6', '\u2026'], // ellipsis
  ['\u00E2\u20AC', '\u201D'],        // right double quote (bare prefix — keep LAST in family)
  // Windows-1255/Hebrew family ("\u05D2\u20AC\u2026") — lead byte 0xE2 decodes to "\u05D2"
  ['\u05D2\u20AC\u201D', '\u2014'], // em dash (E2 80 94)
  ['\u05D2\u20AC\u201C', '\u2013'], // en dash (E2 80 93)
  ['\u05D2\u20AC\u2122', '\u2019'], // right single quote (E2 80 99)
  ['\u05D2\u20AC\u02DC', '\u2018'], // left single quote (E2 80 98)
  ['\u05D2\u20AC\u00A6', '\u2026'], // ellipsis (E2 80 A6)
  ['\u05D2\u20AC', '\u2014'],        // bare 1255 prefix -> em dash (dominant case; keep LAST)
];
function fixMojibake(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  for (const [bad, good] of MOJIBAKE) out = out.split(bad).join(good);
  return out;
}
let repaired = 0;
for (const e of latest) {
  const srv = e.server;
  if (!srv) continue;
  const d = fixMojibake(srv.description);
  const t = fixMojibake(srv.title);
  if (d !== srv.description) { srv.description = d; repaired++; }
  if (t !== srv.title) srv.title = t;
}
console.log(`Repaired mojibake in ${repaired} descriptions`);

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
