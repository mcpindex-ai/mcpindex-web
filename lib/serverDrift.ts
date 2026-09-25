import type { ContextEvent, FleetEvent, LedgerEvent } from './ledger';

// A publisher-wide change this server took part in (ledger /3). Present on ServerDrift only when
// the server is a member of at least one, so a /2 blob serves byte-identical answers.
export interface PublisherWideChange {
  readonly plane: 'tool' | 'context';
  readonly day: string;
  readonly change_kinds: readonly string[];
  readonly servers: number; // servers from this publisher showing a change of the same kind that day
}

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
  // /3 only, and only for a member server: the publisher-wide changes folded into the counts
  // above. Everything else on this object means exactly what it meant under /2.
  readonly publisherWide?: readonly PublisherWideChange[];
  // How many more publisher-wide changes beyond the PUBLISHER_WIDE_SHOWN listed above. Absent
  // when none were left out.
  readonly publisherWideMore?: number;
}

const PUBLISHER_WIDE_SHOWN = 10;

/** Filter the ledger's events to one server (by its precomputed server_fp) and summarize. A server
 * with no matching events returns changes:0 (honest "none observed in window").
 *
 * Returns null only for a /3 blob that contradicts itself about this server: it lists the server
 * in a publisher-wide tool change but gives it no tools anywhere. Answering changes:0 there would
 * be a false clean, so the caller serves "unavailable" instead. A /2 blob never returns null. */
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
  // Ledger /3 publisher-wide changes. [] for a /2 blob, which leaves every output unchanged.
  fleetEvents: readonly FleetEvent[] = [],
): ServerDrift | null {
  const mine = events.filter((e) => e.server_fp === fp);
  const mineCtx = contextEvents.filter((e) => e.server_fp === fp);
  // This server's share of each publisher-wide change it took part in. Folding these back in is
  // what keeps a member's answer identical to /2, where every one of its tools was an event:
  // `page_tools` counts only tools with no independent event, each in exactly one fleet event,
  // so it adds the missing tools without double counting; kinds, safety, last_seen and the
  // removal label fold in from every membership, because an independent event carries only the
  // kinds of its own rows.
  const toolShare: Array<{ ev: FleetEvent; m: FleetEvent['members'][number] }> = [];
  const ctxShare: Array<{ ev: FleetEvent; m: FleetEvent['members'][number] }> = [];
  for (const ev of fleetEvents) {
    for (const m of ev.members) {
      if (m.server_fp !== fp) continue;
      (ev.plane === 'tool' ? toolShare : ctxShare).push({ ev, m });
    }
  }
  const kinds = [
    ...new Set([
      ...mine.flatMap((e) => e.change_kinds),
      ...toolShare.flatMap(({ ev }) => ev.change_kinds),
    ]),
  ].sort();
  // Lexical max is chronological ONLY because last_seen is the fixed-width hour-coarsened shape
  // (YYYY-MM-DDTHH:00:00Z), gated by ledger.ts TS_RE. If that gate ever relaxes, parse to epoch here.
  const latest = (stamps: readonly string[]): string | null =>
    stamps.reduce<string | null>((max, s) => (s && (max === null || s > max) ? s : max), null);
  const lastSeen = latest([...mine.map((e) => e.last_seen), ...toolShare.map(({ m }) => m.last_seen)]);
  const contextLastSeen = latest([
    ...mineCtx.map((e) => e.last_seen),
    ...ctxShare.map(({ m }) => m.last_seen),
  ]);
  const sumShare = (k: 'version_same' | 'version_changed' | 'version_undeclared'): number =>
    toolShare.reduce((n, { m }) => n + (m[k] ?? 0), 0);
  const changes = mine.length + toolShare.reduce((n, { m }) => n + m.page_tools, 0);
  if (toolShare.length > 0 && changes === 0) return null;
  // One line per (plane, day, kinds), newest first, a bounded number of them: a blob that lists
  // a server in many events must not turn one server's answer into an unbounded list.
  const byKey = new Map<string, PublisherWideChange>();
  for (const { ev } of [...toolShare, ...ctxShare]) {
    const key = `${ev.plane}|${ev.day}|${ev.change_kinds.join(',')}`;
    const prev = byKey.get(key);
    if (!prev || ev.servers > prev.servers) {
      byKey.set(key, { plane: ev.plane, day: ev.day, change_kinds: ev.change_kinds, servers: ev.servers });
    }
  }
  const allWide = [...byKey.values()].sort((a, b) => b.day.localeCompare(a.day) || a.plane.localeCompare(b.plane));
  const publisherWide = allWide.slice(0, PUBLISHER_WIDE_SHOWN);
  return {
    changes,
    lastSeen,
    kinds,
    // Tool events only, on purpose: the context block carries its own safety framing, and the
    // "safety-relevant diff" badge sits inside the tool-count block - conflating them would
    // badge a tool count that context drift inflated.
    safetyRelevant: mine.some((e) => e.safety_relevant) || toolShare.some(({ m }) => m.safety_relevant),
    ledgerGeneratedAt,
    toolsetReplaced:
      mine.some((e) => e.removal_scope === 'toolset-replaced') ||
      toolShare.some(({ m }) => m.toolset_replaced),
    versionSameCount: mine.filter((e) => e.version_delta === 'same').length + sumShare('version_same'),
    versionChangedCount:
      mine.filter((e) => e.version_delta === 'changed').length + sumShare('version_changed'),
    versionUndeclaredCount:
      mine.filter((e) => e.version_delta === 'undeclared').length + sumShare('version_undeclared'),
    // A server has at most one context surface, so it counts once whether it changed on its own,
    // in a publisher-wide change, or both - exactly the one context event it had under /2.
    contextChanges: mineCtx.length > 0 ? mineCtx.length : ctxShare.length > 0 ? 1 : 0,
    contextKinds: [
      ...new Set([...mineCtx.flatMap((e) => e.change_kinds), ...ctxShare.flatMap(({ ev }) => ev.change_kinds)]),
    ].sort(),
    contextLastSeen,
    contextSafetyRelevant:
      mineCtx.some((e) => e.safety_relevant) || ctxShare.some(({ m }) => m.safety_relevant),
    known,
    // A property of the BLOB, not of this server: a clean server must not report 'unavailable'
    // while the frame is on. Any event (or /3 fleet member) carrying the field means it is emitting.
    versionEvidence:
      events.some((e) => e.version_delta !== undefined) ||
      fleetEvents.some((ev) => ev.members.some((m) => m.version_same !== undefined))
        ? 'recorded'
        : 'unavailable',
    ...(publisherWide.length > 0 ? { publisherWide } : {}),
    ...(allWide.length > publisherWide.length ? { publisherWideMore: allWide.length - publisherWide.length } : {}),
  };
}
