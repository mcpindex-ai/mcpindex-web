// Report-stats reader for the gated /drift-report page (build plan #11). The mini32 drain
// publishes `drift:report-stats` from the daily incidents metrics (drift_incidents.py ->
// drift_corpus_drain.publish_report_stats) - AGGREGATES ONLY: deduped incident counts by kind,
// the version-delta split with its labeled basis, flip segmentation, removal + unstable splits,
// and coverage. No per-incident rows, no server names, ever, through this key.
//
// GATE: /drift-report 404s unless NEXT_PUBLIC_DRIFT_REPORT === '1' AND the ledger flag is on
// (the report cites the ledger; it never ships ahead of it). The public flip is part of the
// name/DOI ratification deploy unit - never a merge side effect.
//
// This module is PURE (types + validation + the flag) and holds NO Upstash token, so it is safe
// to import anywhere and unit-testable in plain node (style-match lib/ledger.ts). The
// token-holding IO lives in `reportStatsServer.ts` (import 'server-only').

import { SURFACE_CHANGE_KINDS, CONTEXT_SURFACE_CHANGE_KINDS } from './changeKinds';

export const REPORT_STATS_SCHEMA = 'mcpindex.drift.report-stats/1';

/** The flag that makes the drift report public. Ships OFF; flipping it (plus the ledger flag
 * already on) is the deliberate report-unit go-live step. Read on the server so a flip takes
 * effect on the next deploy, deterministically. */
export function driftReportEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DRIFT_REPORT === '1';
}

export type VersionDeltaClass = 'same' | 'changed' | 'undeclared' | 'not-recorded';
const VERSION_DELTA_CLASSES: readonly VersionDeltaClass[] = [
  'same',
  'changed',
  'undeclared',
  'not-recorded',
];

export type VersionDeltaSplit = Readonly<Partial<Record<VersionDeltaClass, number>>>;

export interface ReportGapSpan {
  readonly after: string;
  readonly before: string;
  readonly days: number;
}

export interface ReportCoverage {
  readonly snapshot_count: number;
  readonly pair_count: number;
  readonly first_snapshot: string;
  readonly last_snapshot: string;
  readonly elapsed_days: number;
  readonly gap_spans: readonly ReportGapSpan[];
}

export interface ReportAggregates {
  readonly events_total: number;
  readonly safety_events: number;
  readonly deduped_safety_incidents: number;
  readonly incidents_by_kind: Readonly<Record<string, number>>;
  readonly version_delta_split: VersionDeltaSplit;
  readonly silent_share_pct: number;
  // Keys are '<flip class>|<version delta>', e.g. 'first-labeling|same'.
  readonly flip_segmentation: Readonly<Record<string, number>>;
}

export interface ReportRemovals {
  readonly deduped_removal_fp_count: number;
  readonly deduped_removal_event_count: number;
  readonly removal_scope_split: Readonly<{ single: number; 'toolset-replaced': number }>;
}

export interface ReportUnstable {
  readonly unstable_incident_count: number;
  readonly unstable_tool_count: number;
  readonly excluded_event_share_pct: number;
  readonly by_signal: Readonly<Record<string, number>>;
}

export interface ReportHeadlineExcludingUnstable {
  readonly deduped_safety_incidents: number;
  readonly incidents_by_kind: Readonly<Record<string, number>>;
  readonly version_delta_split: VersionDeltaSplit;
  readonly silent_share_pct: number;
}

export interface ReportStats {
  readonly schema: string;
  readonly generated_at: string;
  readonly aggregates: ReportAggregates;
  readonly coverage: ReportCoverage;
  readonly removals: ReportRemovals;
  readonly unstable: ReportUnstable;
  readonly headline_excluding_unstable: ReportHeadlineExcludingUnstable;
}

// Full-second ISO stamps as the incidents generator writes them (stricter than free-form; the
// blob is operator/attacker-controllable, so the timestamp fields are shape-gated or blanked).
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FLIP_KEY_RE =
  /^(first-labeling|guarantee-change)\|(same|changed|undeclared|not-recorded)$/;
const UNSTABLE_SIGNALS = new Set(['occurrence_days_ge5', 'hash_revert', 'dynamic_metadata']);
const MAX_GAP_SPANS = 24; // bounds a hostile blob; the real corpus has one gap

function num(v: unknown): number {
  const k = Number(v);
  return Number.isFinite(k) && k >= 0 ? Math.floor(k) : 0;
}

/** Percentages keep one decimal (62.4 must not render as 62) but are clamped to [0, 100]. */
function pct(v: unknown): number {
  const k = Number(v);
  if (!Number.isFinite(k) || k < 0) return 0;
  return Math.min(100, Math.round(k * 10) / 10);
}

function ts(v: unknown): string {
  return typeof v === 'string' && TS_RE.test(v) ? v : '';
}

function rec(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Kind counts keyed by the accepted ChangeKind taxonomy (surfaced + context-surface);
 * unknown keys dropped (allowlist). */
function kindCounts(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, c] of Object.entries(rec(v))) {
    if (SURFACE_CHANGE_KINDS.has(k) || CONTEXT_SURFACE_CHANGE_KINDS.has(k)) out[k] = num(c);
  }
  return out;
}

function deltaSplit(v: unknown): VersionDeltaSplit {
  const raw = rec(v);
  const out: Partial<Record<VersionDeltaClass, number>> = {};
  for (const cls of VERSION_DELTA_CLASSES) {
    if (raw[cls] !== undefined) out[cls] = num(raw[cls]);
  }
  return out;
}

function coerceAggregates(v: unknown): ReportAggregates {
  const a = rec(v);
  const flips: Record<string, number> = {};
  for (const [k, c] of Object.entries(rec(a.flip_segmentation))) {
    if (FLIP_KEY_RE.test(k)) flips[k] = num(c);
  }
  return {
    events_total: num(a.events_total),
    safety_events: num(a.safety_events),
    deduped_safety_incidents: num(a.deduped_safety_incidents),
    incidents_by_kind: kindCounts(a.incidents_by_kind),
    version_delta_split: deltaSplit(a.version_delta_split),
    silent_share_pct: pct(a.silent_share_pct),
    flip_segmentation: flips,
  };
}

function coerceCoverage(v: unknown): ReportCoverage {
  const c = rec(v);
  const spans: ReportGapSpan[] = [];
  if (Array.isArray(c.gap_spans)) {
    for (const s of c.gap_spans.slice(0, MAX_GAP_SPANS)) {
      const g = rec(s);
      const days = Number(g.days);
      spans.push({
        after: ts(g.after),
        before: ts(g.before),
        days: Number.isFinite(days) && days >= 0 ? Math.round(days * 10) / 10 : 0,
      });
    }
  }
  return {
    snapshot_count: num(c.snapshot_count),
    pair_count: num(c.pair_count),
    first_snapshot: ts(c.first_snapshot),
    last_snapshot: ts(c.last_snapshot),
    elapsed_days: num(c.elapsed_days),
    gap_spans: spans,
  };
}

function coerceRemovals(v: unknown): ReportRemovals {
  const r = rec(v);
  const split = rec(r.removal_scope_split);
  return {
    deduped_removal_fp_count: num(r.deduped_removal_fp_count),
    deduped_removal_event_count: num(r.deduped_removal_event_count),
    removal_scope_split: {
      single: num(split.single),
      'toolset-replaced': num(split['toolset-replaced']),
    },
  };
}

function coerceUnstable(v: unknown): ReportUnstable {
  const u = rec(v);
  const signals: Record<string, number> = {};
  for (const [k, c] of Object.entries(rec(u.by_signal))) {
    if (UNSTABLE_SIGNALS.has(k)) signals[k] = num(c);
  }
  return {
    unstable_incident_count: num(u.unstable_incident_count),
    unstable_tool_count: num(u.unstable_tool_count),
    excluded_event_share_pct: pct(u.excluded_event_share_pct),
    by_signal: signals,
  };
}

function coerceHeadline(v: unknown): ReportHeadlineExcludingUnstable {
  const h = rec(v);
  return {
    deduped_safety_incidents: num(h.deduped_safety_incidents),
    incidents_by_kind: kindCounts(h.incidents_by_kind),
    version_delta_split: deltaSplit(h.version_delta_split),
    silent_share_pct: pct(h.silent_share_pct),
  };
}

/** Validate a raw Upstash value (string OR already-parsed object, per `automaticDeserialization`)
 * into ReportStats. Returns null for a missing/unparseable/wrong-schema blob - the page treats
 * null as "live counters unavailable" and falls back to the frozen edition. Never throws. */
export function parseReportStatsBlob(raw: unknown): ReportStats | null {
  if (!raw) return null;
  let blob: Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      blob = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else if (typeof raw === 'object') {
    blob = raw as Record<string, unknown>;
  } else {
    return null;
  }
  if (blob.schema !== REPORT_STATS_SCHEMA) return null; // refuse an unknown schema version
  return {
    schema: REPORT_STATS_SCHEMA,
    generated_at: ts(blob.generated_at),
    aggregates: coerceAggregates(blob.aggregates),
    coverage: coerceCoverage(blob.coverage),
    removals: coerceRemovals(blob.removals),
    unstable: coerceUnstable(blob.unstable),
    headline_excluding_unstable: coerceHeadline(blob.headline_excluding_unstable),
  };
}
