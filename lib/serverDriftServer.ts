// Server-only reader: server-level drift for a named server, from the ledger split's per-server hash.
// Touches the ledger read path (Upstash token lives behind ledgerServer), so it is guarded by
// `import 'server-only'`. The fingerprint + aggregation are pure (driftFingerprint, serverDrift).

import 'server-only';
import { ledgerEnabled } from './ledger';
import { loadLedgerServerField, loadLedgerServersCount, loadLedgerSummary } from './ledgerServer';
import { EMPTY_SLICE, parseServerSlice, type LedgerSummary } from './ledgerSplit';
import { serverFp } from './driftFingerprint';
import { aggregateServerDrift, type ServerDrift } from './serverDrift';
import { loadServers } from './registry';

// The server page prerenders ~11.6k pages and each needs the SAME summary and HLEN. Memoize them so
// a full build does a couple of Upstash reads for them, not one per page. The memo lives on
// globalThis (NOT a module `let`): Next's static generation renders pages in isolated module scopes
// that reset plain module state, so a module-level memo silently re-fetches per page. In-flight
// dedup avoids a stampede; an unusable result IS cached (a build/Upstash hiccup must not re-fetch
// 11.6k times); a 5min TTL bounds staleness well inside the page's 1h ISR.
//
// `usable` is false when the summary is missing or stale, or the hash holds fewer fields than the
// summary says it wrote: a server with no drift has no field, so a lost hash would otherwise read
// as clean everywhere.
type SplitMemo = { at: number; summary: LedgerSummary | null; usable: boolean };
const G = globalThis as unknown as {
  __mcpiSplitMemo?: SplitMemo;
  __mcpiSplitInflight?: Promise<SplitMemo>;
  __mcpiRegistryNames?: Promise<ReadonlySet<string>>;
};

/** The registry `server.name` set, so a drift answer can say whether the name is one we crawl.
 *
 * WHY THIS IS WORTH A LOOKUP. Without it an unknown or misspelled name returns changes:0 and
 * contextChanges:0, which is byte-identical to a clean bill of health. `?server=test` answered
 * exactly that until 2026-08-24. On this surface a false clean is the worst possible failure.
 *
 * Memoized on globalThis for the same reason the split is: Next's static generation resets plain
 * module state per page, so a module-level memo silently rebuilds a ~13k-entry Set per render.
 * The promise itself is cached, which also dedups a cold-start stampede. `loadServers()` is
 * already on the server-page render path, so this adds no new data source.
 *
 * A failure resolves to an EMPTY set, which reports known:false for everything. That renders
 * nothing rather than a wrong clean - fail-closed, matching the rest of this path. */
async function registryNames(): Promise<ReadonlySet<string>> {
  if (!G.__mcpiRegistryNames) {
    G.__mcpiRegistryNames = loadServers()
      .then((servers) => new Set(servers.map((s) => s.name)))
      .catch(() => new Set<string>());
  }
  return G.__mcpiRegistryNames;
}
async function cachedSplit(): Promise<SplitMemo> {
  const m = G.__mcpiSplitMemo;
  if (m && Date.now() - m.at < 300_000) return m;
  if (G.__mcpiSplitInflight) return G.__mcpiSplitInflight;
  G.__mcpiSplitInflight = (async (): Promise<SplitMemo> => {
    // Summary BEFORE the hash reads: the drain writes the hash first and the summary last.
    const summary = await loadLedgerSummary();
    const fields = summary ? await loadLedgerServersCount() : null;
    const memo = { at: Date.now(), summary, usable: !!summary && fields !== null && fields >= summary.servers };
    G.__mcpiSplitMemo = memo;
    return memo;
  })().finally(() => {
    G.__mcpiSplitInflight = undefined;
  });
  return G.__mcpiSplitInflight;
}

/** One server's answer from the split, or null when the split cannot answer: it is unusable, a
 * read failed, or the field is malformed. Null renders as "unavailable", never as clean. */
async function serverDriftFromSplit(fp: string, known: boolean): Promise<ServerDrift | null> {
  const split = await cachedSplit();
  if (!split.usable || !split.summary) return null;
  const field = await loadLedgerServerField(fp);
  if (field === undefined) return null;
  if (field === null) {
    // No field reads as clean, so re-check the hash now instead of trusting the memo's HLEN: a
    // hash evicted or deleted inside the memo window would otherwise read clean everywhere. One
    // extra command, only for servers with no drift.
    const fields = await loadLedgerServersCount();
    if (fields === null || fields < split.summary.servers) return null;
  }
  const slice = field === null ? EMPTY_SLICE : parseServerSlice(field, fp);
  if (!slice) return null;
  const drift = aggregateServerDrift(
    slice.events,
    fp,
    split.summary.ledger.generated_at,
    slice.context_events,
    known,
    slice.fleet_events,
  );
  // aggregateServerDrift reads versionEvidence off the rows it is given, but it is a property of
  // the whole blob: a clean server's empty slice would otherwise say 'unavailable'.
  return drift && { ...drift, versionEvidence: split.summary.versionEvidence ? 'recorded' : 'unavailable' };
}

/** Drift summary for one named registry server. Returns null only when the ledger surface is off or
 * unavailable (page renders nothing / "unavailable", never a false "clean"). A reachable-but-clean
 * server returns changes:0 with known:true; a name we do not crawl returns the same zeros with
 * known:false, and the two must never be read alike. `serverId` is the registry `server.name`. */
export async function loadServerDrift(serverId: string): Promise<ServerDrift | null> {
  if (!ledgerEnabled()) return null;
  const fp = serverFp(serverId);
  const known = (await registryNames()).has(serverId);
  return serverDriftFromSplit(fp, known);
}
