// Server-only reader: server-level drift for a named server, joined from the public ledger blob.
// Touches the ledger read path (Upstash token lives behind ledgerServer), so it is guarded by
// `import 'server-only'`. The fingerprint + aggregation are pure (driftFingerprint, serverDrift).

import 'server-only';
import { ledgerEnabled, type Ledger } from './ledger';
import { loadLedger } from './ledgerServer';
import { serverFp } from './driftFingerprint';
import { aggregateServerDrift, type ServerDrift } from './serverDrift';
import { loadServers } from './registry';

// The server page prerenders ~11.6k pages and each needs the SAME ledger blob. Memoize it so a full
// build does a couple of Upstash GETs, not one per page. The memo lives on globalThis (NOT a module
// `let`): Next's static generation renders pages in isolated module scopes that reset plain module
// state, so a module-level memo silently re-fetches per page and turns a 12min build into hours.
// In-flight dedup avoids a stampede; null IS cached (a build/Upstash hiccup must not re-fetch 11.6k
// times); a 5min TTL bounds staleness well inside the page's 1h ISR.
type LedgerMemo = { at: number; ledger: Ledger | null };
const G = globalThis as unknown as {
  __mcpiLedgerMemo?: LedgerMemo;
  __mcpiLedgerInflight?: Promise<Ledger | null>;
  __mcpiRegistryNames?: Promise<ReadonlySet<string>>;
};

/** The registry `server.name` set, so a drift answer can say whether the name is one we crawl.
 *
 * WHY THIS IS WORTH A LOOKUP. Without it an unknown or misspelled name returns changes:0 and
 * contextChanges:0, which is byte-identical to a clean bill of health. `?server=test` answered
 * exactly that until 2026-08-24. On this surface a false clean is the worst possible failure.
 *
 * Memoized on globalThis for the same reason the ledger is: Next's static generation resets plain
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
async function cachedLedger(): Promise<Ledger | null> {
  const m = G.__mcpiLedgerMemo;
  if (m && Date.now() - m.at < 300_000) return m.ledger;
  if (G.__mcpiLedgerInflight) return G.__mcpiLedgerInflight;
  G.__mcpiLedgerInflight = loadLedger()
    .then((ledger) => {
      G.__mcpiLedgerMemo = { at: Date.now(), ledger };
      return ledger;
    })
    .finally(() => {
      G.__mcpiLedgerInflight = undefined;
    });
  return G.__mcpiLedgerInflight;
}

/** Drift summary for one named registry server. Returns null only when the ledger surface is off or
 * unavailable (page renders nothing / "unavailable", never a false "clean"). A reachable-but-clean
 * server returns changes:0 with known:true; a name we do not crawl returns the same zeros with
 * known:false, and the two must never be read alike. `serverId` is the registry `server.name`. */
export async function loadServerDrift(serverId: string): Promise<ServerDrift | null> {
  if (!ledgerEnabled()) return null;
  const ledger = await cachedLedger();
  if (!ledger) return null;
  return aggregateServerDrift(
    ledger.events,
    serverFp(serverId),
    ledger.generated_at,
    ledger.context_events,
    (await registryNames()).has(serverId),
  );
}
