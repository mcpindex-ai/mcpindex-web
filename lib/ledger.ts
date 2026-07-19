// Public drift ledger (M4, read side). Reads the `drift:ledger` blob the mini32 drain maintains
// and exposes it to the C9 page + /api/v1/ledger. The blob is what mcpindex's CRAWLER OBSERVED:
// contract changes between two daily registry snapshots - a contract diff, NOT a safety verdict
// and NOT an in-path prevention (that's the gate). Every row is crawl-seen (public-registry
// server); forgeable install reports never enter this surface.
//
// ONE-WAY DOOR: this surface is gated by NEXT_PUBLIC_DRIFT_LEDGER. Until it's '1', the page 404s
// and the API 404s - go-live (M4) is a deliberate env flip + redeploy, never a merge side effect.
//
// This module is PURE (types + validation + the public flag) and has NO Upstash token, so it is
// safe to import from anywhere and is unit-testable in plain node. The token-holding IO lives in
// `ledgerServer.ts` (import 'server-only').

import { coerceChangeKinds } from './changeKinds';

export const LEDGER_SCHEMA = 'mcpindex.drift.ledger/2';

/** The flag that makes the ledger public. M4 go-live = set this to '1' in Vercel + redeploy.
 * Read on the SERVER (page + route) so a flip takes effect on the next deploy, deterministically.
 * NOTE for go-live: flipping this only un-404s /ledger + /dashboard + /api/v1/ledger. It does NOT
 * link them. To surface the pages, also add them to lib/site-nav.ts (or the Footer) and
 * app/sitemap.ts in the same go-live change, or they ship live-but-unlinked. */
export function ledgerEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DRIFT_LEDGER === '1';
}

export interface LedgerEvent {
  readonly tool_fp: string;
  readonly server_fp: string;
  readonly sources: number; // 1 = the crawl (forgeable installs are excluded from this number)
  readonly safety_relevant: boolean;
  readonly last_seen: string;
  // What changed (surfaceable ChangeKinds, e.g. 'added-required-param'). ADDITIVE on schema /2:
  // an old blob without it coerces to [], a new blob's value is allowlist-validated. Never raw.
  readonly change_kinds: readonly string[];
  // Removal context (ADDITIVE on /2, change_kinds precedent): most removals arrive as full
  // toolset replacements, not single deletions - the label pairs every removal row with that
  // context. Absent unless the blob carries a valid value.
  readonly removal_scope?: 'single' | 'toolset-replaced';
  // Version evidence (ADDITIVE on /2; emitted by the drain only behind the ratification-gated
  // evidence flag). The value is the drain's fairness-first REDUCTION over every transition
  // for this fp: 'same' only when every computable transition kept the declared version;
  // any version change wins; any undeclared transition blocks 'same'. 'not-recorded' = our
  // observation gap, renders nothing.
  readonly version_delta?: 'same' | 'changed' | 'undeclared' | 'not-recorded';
}

const REMOVAL_SCOPES = new Set(['single', 'toolset-replaced']);
const VERSION_DELTAS = new Set(['same', 'changed', 'undeclared', 'not-recorded']);

export interface LedgerStat {
  readonly tools_observed_drifting: number; // the numerator (N)
  readonly total_contract_drifts_observed: number; // the honest denominator (M) - N of M, never "all"
  readonly servers: number;
  readonly safety_relevant: number;
  // Count of surfaced fps whose REDUCED version_delta is 'same' (never counts an fp with any
  // version-changed or undeclared transition). Present only when the drain emits the gated
  // evidence fields; undefined otherwise (absence of the stat is not zero).
  readonly silent_same_version?: number;
}

export interface Ledger {
  readonly schema: string;
  readonly generated_at: string;
  readonly framing: string;
  readonly stat: LedgerStat;
  readonly events: readonly LedgerEvent[];
}

const FP_RE = /^[0-9a-f]{32}$/;
// The drain coarsens last_seen to the hour: YYYY-MM-DDTHH:00:00Z. The blob is operator/attacker-
// controllable, so gate the one free-form timestamp field to that exact shape (else blank it) -
// a malformed/oversized/unicode-spoofed string can't reach the public page.
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** Bound any free string from the blob so a hostile value can't bloat the page (React already
 * escapes, so this is about size/format, not XSS). */
function clampStr(v: unknown, max: number): string {
  return typeof v === 'string' && v.length <= max ? v : '';
}

export function coerceEvent(x: unknown): LedgerEvent | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Record<string, unknown>;
  const tool_fp = typeof e.tool_fp === 'string' ? e.tool_fp : '';
  if (!FP_RE.test(tool_fp)) return null; // never render an unvalidated fp
  const sources = Number(e.sources);
  const last_seen = typeof e.last_seen === 'string' && TS_RE.test(e.last_seen) ? e.last_seen : '';
  const scope =
    typeof e.removal_scope === 'string' && REMOVAL_SCOPES.has(e.removal_scope)
      ? (e.removal_scope as 'single' | 'toolset-replaced')
      : undefined;
  const vdelta =
    typeof e.version_delta === 'string' && VERSION_DELTAS.has(e.version_delta)
      ? (e.version_delta as 'same' | 'changed' | 'undeclared' | 'not-recorded')
      : undefined;
  return {
    tool_fp,
    server_fp: typeof e.server_fp === 'string' && FP_RE.test(e.server_fp) ? e.server_fp : '',
    sources: Number.isFinite(sources) && sources >= 1 ? Math.floor(sources) : 1, // honest floor
    safety_relevant: e.safety_relevant === true,
    last_seen,
    change_kinds: coerceChangeKinds(e.change_kinds), // allowlist-validated; [] for an old blob
    ...(scope ? { removal_scope: scope } : {}),
    ...(vdelta ? { version_delta: vdelta } : {}),
  };
}

export function coerceStat(x: unknown): LedgerStat {
  const s = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const n = (v: unknown): number => {
    const k = Number(v);
    return Number.isFinite(k) && k >= 0 ? Math.floor(k) : 0;
  };
  const silent = s.silent_same_version;
  const silentN = Number(silent);
  return {
    tools_observed_drifting: n(s.tools_observed_drifting),
    total_contract_drifts_observed: n(s.total_contract_drifts_observed),
    servers: n(s.servers),
    safety_relevant: n(s.safety_relevant),
    ...(silent !== undefined && Number.isFinite(silentN) && silentN >= 0
      ? { silent_same_version: Math.floor(silentN) }
      : {}),
  };
}

/** Validate a raw Upstash value (string OR already-parsed object, per `automaticDeserialization`)
 * into a Ledger. Returns null for a missing/unparseable/wrong-schema blob. Pure + exported so the
 * branchy parsing (the live data path) is unit-testable without a Redis. Never throws. */
export function parseLedgerBlob(raw: unknown): Ledger | null {
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
  if (blob.schema !== LEDGER_SCHEMA) return null; // refuse an unknown schema version
  const events = Array.isArray(blob.events)
    ? blob.events.map(coerceEvent).filter((e): e is LedgerEvent => e !== null)
    : [];
  return {
    schema: LEDGER_SCHEMA,
    generated_at: clampStr(blob.generated_at, 32), // ISO timestamp; bounded
    framing: clampStr(blob.framing, 280), // one honest sentence; bounded
    stat: coerceStat(blob.stat),
    events,
  };
}
