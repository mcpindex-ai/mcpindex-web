import type { ContextEvent, LedgerEvent } from './ledger';

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
  // Server-scoped context-surface drift (instructions / prompt metadata), from the blob's
  // out-of-band context_events - counted APART from `changes` because these are not tools.
  readonly contextChanges: number;
  readonly contextKinds: readonly string[]; // union across this server's context events, sorted
  readonly contextLastSeen: string | null; // hour-coarsened ISO, or null
  // `safetyRelevant` above is computed over TOOL events only, and a caller reading it next to
  // `contextChanges` gets a false all-clear on the one surface no tool gate covers. Live example
  // on 2026-08-24: ai.mcpanalytics/analytics returned safetyRelevant:false carrying a
  // safety-relevant instructions-added. Separate field rather than folding it into the shipped
  // flag, because that flag's meaning is already published and consumed.
  readonly contextSafetyRelevant: boolean;
  // IS THIS A NAME WE ACTUALLY CRAWL? Without it, an unknown or misspelled `server` returns
  // changes:0 / contextChanges:0, which is byte-identical to a clean bill of health - the exact
  // false-clean this whole surface is built to avoid. `?server=test` returned that healthy-looking
  // shape until 2026-08-24. false means the zeros below carry NO information.
  readonly known: boolean;
  // Whether the blob carries version evidence at all. The counts below are `.length` over a field
  // the drain emits only behind a two-key ratification gate (env flag AND a committed RATIFIED
  // marker), so when the frame is off every count is 0 and a caller cannot tell that from "no
  // server has this evidence". `LedgerEvent.version_delta` is optional and its own comment says
  // absence is not zero; this is that distinction surviving to the API boundary. Measured
  // 2026-08-24: absent on all 13,862 live events, so this reads 'unavailable' in production today.
  readonly versionEvidence: 'recorded' | 'unavailable';
}

/** Filter the ledger's events to one server (by its precomputed server_fp) and summarize. A server
 * with no matching events returns changes:0 (honest "none observed in window"), never null. */
export function aggregateServerDrift(
  events: readonly LedgerEvent[],
  fp: string,
  ledgerGeneratedAt: string,
  contextEvents: readonly ContextEvent[] = [], // absent on a blob predating the emit leg
  // DEFAULTS FALSE, fail-closed. It has to be optional (it follows an optional param), so the
  // question is which way an unwired caller should be wrong. `true` would let a caller that never
  // consulted the registry assert knowledge it does not have, which is precisely the false-clean
  // this field exists to kill. `false` degrades to "we cannot vouch for these zeros".
  known: boolean = false,
): ServerDrift {
  const mine = events.filter((e) => e.server_fp === fp);
  const mineCtx = contextEvents.filter((e) => e.server_fp === fp);
  const kinds = [...new Set(mine.flatMap((e) => e.change_kinds))].sort();
  // Lexical max is chronological ONLY because last_seen is the fixed-width hour-coarsened shape
  // (YYYY-MM-DDTHH:00:00Z), gated by ledger.ts TS_RE. If that gate ever relaxes, parse to epoch here.
  const lastSeen = mine.reduce<string | null>(
    (max, e) => (e.last_seen && (max === null || e.last_seen > max) ? e.last_seen : max),
    null,
  );
  // Same fixed-width lexical-max trick as lastSeen above (gated by ledger.ts TS_RE).
  const contextLastSeen = mineCtx.reduce<string | null>(
    (max, e) => (e.last_seen && (max === null || e.last_seen > max) ? e.last_seen : max),
    null,
  );
  return {
    changes: mine.length,
    lastSeen,
    kinds,
    // Tool events only, on purpose: the context block carries its own safety framing, and the
    // "safety-relevant diff" badge sits inside the tool-count block - conflating them would
    // badge a tool count that context drift inflated.
    safetyRelevant: mine.some((e) => e.safety_relevant),
    ledgerGeneratedAt,
    toolsetReplaced: mine.some((e) => e.removal_scope === 'toolset-replaced'),
    versionSameCount: mine.filter((e) => e.version_delta === 'same').length,
    versionChangedCount: mine.filter((e) => e.version_delta === 'changed').length,
    versionUndeclaredCount: mine.filter((e) => e.version_delta === 'undeclared').length,
    contextChanges: mineCtx.length,
    contextKinds: [...new Set(mineCtx.flatMap((e) => e.change_kinds))].sort(),
    contextLastSeen,
    contextSafetyRelevant: mineCtx.some((e) => e.safety_relevant),
    known,
    // A property of the BLOB, not of this server: a clean server must not report 'unavailable'
    // while the frame is on. Any event carrying the field at all means the frame is emitting.
    versionEvidence: events.some((e) => e.version_delta !== undefined) ? 'recorded' : 'unavailable',
  };
}
