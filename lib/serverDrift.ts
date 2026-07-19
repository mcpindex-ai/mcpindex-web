import type { LedgerEvent } from './ledger';

// Server-level drift summary for ONE named server, derived purely from the public ledger blob by
// matching each event's server_fp. Tool-level identities stay anonymized (we never de-anonymize a
// tool_fp). This is the pure aggregation; the Redis-touching reader is in serverDriftServer.ts.

export interface ServerDrift {
  readonly changes: number; // ledger events (drifting tools) attributed to this server in the window
  readonly lastSeen: string | null; // most recent hour-coarsened ISO, or null
  readonly kinds: readonly string[]; // union of change_kinds across this server's events, sorted
  readonly safetyRelevant: boolean; // any matched event touched a safety-relevant field
  readonly ledgerGeneratedAt: string; // freshness of the underlying ledger blob
  // Removal fairness context: true when any removal event for this server was part of a
  // >=5-at-once toolset replacement - the label ships with the rows so a bulk replacement
  // never renders as N bare removals on a named page.
  readonly toolsetReplaced: boolean;
  // Version-evidence counts by the per-fp REDUCED version_delta (D4 fairness surface):
  // a server that changed WITH a version change gets that exculpatory context; undeclared
  // is its own class, never conflated with silent; not-recorded contributes to none.
  readonly versionSameCount: number;
  readonly versionChangedCount: number;
  readonly versionUndeclaredCount: number;
}

/** Filter the ledger's events to one server (by its precomputed server_fp) and summarize. A server
 * with no matching events returns changes:0 (honest "none observed in window"), never null. */
export function aggregateServerDrift(
  events: readonly LedgerEvent[],
  fp: string,
  ledgerGeneratedAt: string,
): ServerDrift {
  const mine = events.filter((e) => e.server_fp === fp);
  const kinds = [...new Set(mine.flatMap((e) => e.change_kinds))].sort();
  // Lexical max is chronological ONLY because last_seen is the fixed-width hour-coarsened shape
  // (YYYY-MM-DDTHH:00:00Z), gated by ledger.ts TS_RE. If that gate ever relaxes, parse to epoch here.
  const lastSeen = mine.reduce<string | null>(
    (max, e) => (e.last_seen && (max === null || e.last_seen > max) ? e.last_seen : max),
    null,
  );
  return {
    changes: mine.length,
    lastSeen,
    kinds,
    safetyRelevant: mine.some((e) => e.safety_relevant),
    ledgerGeneratedAt,
    toolsetReplaced: mine.some((e) => e.removal_scope === 'toolset-replaced'),
    versionSameCount: mine.filter((e) => e.version_delta === 'same').length,
    versionChangedCount: mine.filter((e) => e.version_delta === 'changed').length,
    versionUndeclaredCount: mine.filter((e) => e.version_delta === 'undeclared').length,
  };
}
