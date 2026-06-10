// Server-only reader: server-level drift for a named server, joined from the public ledger blob.
// Touches the ledger read path (Upstash token lives behind ledgerServer), so it is guarded by
// `import 'server-only'`. The fingerprint + aggregation are pure (driftFingerprint, serverDrift).

import 'server-only';
import { ledgerEnabled, type Ledger } from './ledger';
import { loadLedger } from './ledgerServer';
import { serverFp } from './driftFingerprint';
import { aggregateServerDrift, type ServerDrift } from './serverDrift';

// The server page prerenders ~11k pages and each needs the SAME ledger blob. Memoize it for 60s so
// a full build does a handful of Upstash GETs instead of one per page. Only SUCCESSES are cached
// (a transient null isn't poisoned across the window); freshness stays well inside the page's ISR.
let _cached: { at: number; ledger: Ledger } | undefined;
async function cachedLedger(): Promise<Ledger | null> {
  if (_cached && Date.now() - _cached.at < 60_000) return _cached.ledger;
  const ledger = await loadLedger();
  if (ledger) _cached = { at: Date.now(), ledger };
  return ledger;
}

/** Drift summary for one named registry server. Returns null only when the ledger surface is off or
 * unavailable (page renders nothing / "unavailable", never a false "clean"). A reachable-but-clean
 * server returns changes:0. `serverId` is the registry `server.name`. */
export async function loadServerDrift(serverId: string): Promise<ServerDrift | null> {
  if (!ledgerEnabled()) return null;
  const ledger = await cachedLedger();
  if (!ledger) return null;
  return aggregateServerDrift(ledger.events, serverFp(serverId), ledger.generated_at);
}
