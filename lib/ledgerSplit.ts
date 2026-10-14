// Read side of the ledger split (mcpindex-trust PR 182). The drain writes two slivers that every
// web reader now uses; the full `drift:ledger` blob is no longer published or read:
//
//   drift:ledger:summary   stat, the newest 300 events and context_events, fleet events without
//                          members, all-time per-kind counts, row counts. For /ledger, /scan,
//                          /dashboard and the Drift Report.
//   drift:ledger:servers   one field per server_fp: exactly the rows aggregateServerDrift filters
//                          for that server. For server pages and /api/v1/server-drift.
//
// Both are validated through parseLedgerBlob, so they get the same coercion and the same /3
// fail-closed rules the full blob had. Anything off (missing, stale, malformed, a hash shorter
// than the summary says) makes the caller report the ledger unavailable. The summary may carry
// `sizes` ({max_server_gz, max_page_gz}); nothing here needs it, so it is ignored. PURE: no
// Upstash token here (see ledgerServer.ts).

import {
  LEDGER_SCHEMA,
  LEDGER_SCHEMA_V3,
  parseLedgerBlob,
  type ContextEvent,
  type FleetEvent,
  type Ledger,
  type LedgerEvent,
} from './ledger';

export const LEDGER_SUMMARY_SCHEMA = 'mcpindex.drift.ledger-summary/1';
export const LEDGER_SERVER_SCHEMA = 'mcpindex.drift.ledger-server/1';

// The drain writes hourly and deletes the summary on any run that does not write the split. This
// bound covers a summary the drain could not delete: older than this, the ledger reads as
// unavailable rather than serving numbers an hour and a half old. A summary dated ahead of the
// clock by more than the skew allowance is refused too, or it would never go stale. The /4 index
// is held to the same rule.
export const SUMMARY_MAX_AGE_MS = 90 * 60_000;
const SUMMARY_MAX_SKEW_MS = 5 * 60_000;

/** True when an ISO timestamp is no older than SUMMARY_MAX_AGE_MS and not ahead of the clock by
 * more than the skew allowance. */
export function generatedAtIsFresh(generatedAt: string, nowMs: number): boolean {
  const at = Date.parse(generatedAt);
  return Number.isFinite(at) && nowMs - at <= SUMMARY_MAX_AGE_MS && at - nowMs <= SUMMARY_MAX_SKEW_MS;
}

/** What the ledger pages read. `ledger.events` and `ledger.context_events` may be only the newest
 * rows, so totals and kind counts come from here, never from the array lengths. */
export interface LedgerView {
  readonly ledger: Ledger;
  readonly eventsTotal: number;
  readonly contextEventsTotal: number;
  readonly kindCounts: Readonly<Record<string, number>>;
}

/** The split's summary, with what the server path needs on top of the page view. */
export interface LedgerSummary extends LedgerView {
  readonly versionEvidence: boolean;
  readonly servers: number; // fields in drift:ledger:servers when this summary was written
}

export interface ServerSlice {
  readonly events: readonly LedgerEvent[];
  readonly context_events: readonly ContextEvent[];
  readonly fleet_events: readonly FleetEvent[];
}

export const EMPTY_SLICE: ServerSlice = { events: [], context_events: [], fleet_events: [] };

function asObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      const v: unknown = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function nonNegInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}

/** Validate a decoded `drift:ledger:summary` value. Null when missing, malformed, or stale. */
export function parseLedgerSummary(raw: unknown, nowMs: number): LedgerSummary | null {
  const s = asObject(raw);
  if (!s || s.schema !== LEDGER_SUMMARY_SCHEMA) return null;
  if (s.ledger_schema !== LEDGER_SCHEMA && s.ledger_schema !== LEDGER_SCHEMA_V3) return null;
  if (typeof s.generated_at !== 'string' || !generatedAtIsFresh(s.generated_at, nowMs)) return null;
  const c = asObject(s.counts);
  const eventsTotal = nonNegInt(c?.events);
  const contextEventsTotal = nonNegInt(c?.context_events);
  const servers = nonNegInt(c?.servers);
  if (eventsTotal === undefined || contextEventsTotal === undefined || servers === undefined) return null;
  const kc = asObject(s.kind_counts);
  if (!kc) return null;
  const kindCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(kc)) {
    const n = nonNegInt(v);
    if (n === undefined) return null;
    kindCounts[k] = n;
  }
  // Summary fleet heads carry no members. They are given `members: []` only so the shared /3
  // coercion accepts them for the publisher-wide table and the independent-twin check, which
  // count planes. They must never reach aggregateServerDrift: server answers come from the
  // per-server hash, whose fleet rows carry the real member.
  const fleets = s.fleet_events;
  const blob: Record<string, unknown> = {
    schema: s.ledger_schema,
    generated_at: s.generated_at,
    framing: s.framing,
    stat: s.stat,
    events: s.events,
    context_events: s.context_events,
    ...(Array.isArray(fleets)
      ? { fleet_events: fleets.map((f) => (f && typeof f === 'object' ? { ...f, members: [] } : f)) }
      : {}),
  };
  const ledger = parseLedgerBlob(blob);
  if (!ledger) return null;
  if (ledger.events.length > eventsTotal || ledger.context_events.length > contextEventsTotal) return null;
  return {
    ledger,
    eventsTotal,
    contextEventsTotal,
    kindCounts,
    versionEvidence: s.version_evidence === true,
    servers,
  };
}

/** Validate one decoded `drift:ledger:servers` field. Null when malformed; the caller then reports
 * the server's drift unavailable. (A server with no field has no drift: that is EMPTY_SLICE,
 * decided by the caller after its HLEN check.) */
export function parseServerSlice(raw: unknown, serverFp: string): ServerSlice | null {
  const v = asObject(raw);
  if (!v || v.schema !== LEDGER_SERVER_SCHEMA) return null;
  if (!Array.isArray(v.events) || !Array.isArray(v.context_events) || !Array.isArray(v.fleet_events)) {
    return null;
  }
  const parsed = parseLedgerBlob({
    schema: LEDGER_SCHEMA_V3,
    stat: {},
    events: v.events,
    context_events: v.context_events,
    fleet_events: v.fleet_events,
  });
  if (!parsed?.fleet_events) return null;
  // parseLedgerBlob drops a malformed event or context row instead of failing. Here a dropped
  // row would turn into a false clean for this server, so any loss rejects the slice.
  if (parsed.events.length !== v.events.length || parsed.context_events.length !== v.context_events.length) {
    return null;
  }
  // Every row has to belong to the server it was filed under.
  const mine =
    parsed.events.every((e) => e.server_fp === serverFp) &&
    parsed.context_events.every((e) => e.server_fp === serverFp) &&
    parsed.fleet_events.every((f) => f.members.length === 1 && f.members[0].server_fp === serverFp);
  if (!mine) return null;
  return { events: parsed.events, context_events: parsed.context_events, fleet_events: parsed.fleet_events };
}
