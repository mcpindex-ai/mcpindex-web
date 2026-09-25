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

import {
  CONTEXT_SURFACE_CHANGE_KINDS,
  SURFACE_CHANGE_KINDS,
  coerceChangeKinds,
} from './changeKinds';

export const LEDGER_SCHEMA = 'mcpindex.drift.ledger/2';
// /3 (spec: tasks/spec-ledger-fleet-collapse-2026-09-25.md) counts a publisher-wide change once.
// `events` stops listing tools whose only change was part of one, which changes what /2 promised,
// so it ships under its own string. Both are accepted forever: a drain rollback is a flag flip,
// and the reader has to render whichever blob is live without a redeploy.
export const LEDGER_SCHEMA_V3 = 'mcpindex.drift.ledger/3';

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

// Server-scoped context-surface drift (instructions / prompts-list metadata the server injects
// into agent context). Carried OUT-OF-BAND from `events` in the blob's ADDITIVE `context_events`
// array because these are not tools: counting one into the tool rows would render a phantom
// "drifting tool" on the named server page. There is deliberately no fingerprint field - the
// drain's internal context fp never publishes; server_fp is the whole public identity, so a row
// without a valid one is dropped (unattributable = unrenderable).
export interface ContextEvent {
  readonly server_fp: string;
  readonly sources: number; // 1 = the crawl
  readonly safety_relevant: boolean;
  readonly last_seen: string;
  readonly change_kinds: readonly string[]; // subset of CONTEXT_SURFACE_CHANGE_KINDS, non-empty
}

export interface LedgerStat {
  readonly tools_observed_drifting: number; // the numerator (N)
  readonly total_contract_drifts_observed: number; // the honest denominator (M) - N of M, never "all"
  readonly servers: number;
  readonly safety_relevant: number;
  // Count of surfaced fps whose REDUCED version_delta is 'same' (never counts an fp with any
  // version-changed or undeclared transition). Present only when the drain emits the gated
  // evidence fields; undefined otherwise (absence of the stat is not zero).
  readonly silent_same_version?: number;
  // Server-scoped context surfaces with published drift (the context_events count). ADDITIVE;
  // absent on a blob that predates the emit leg (absence is not zero).
  readonly context_surfaces_drifting?: number;
  // /3 only: the same counts taken OUTSIDE publisher-wide changes, plus the size of those
  // changes. Every field above keeps its /2 meaning (all tools), so a figure cited before /3
  // stays comparable. Absent on a /2 blob, and dropped whole if any part is malformed or breaks
  // an invariant against the totals: a missing twin renders today's copy, never a 0.
  readonly independent?: IndependentStat;
}

export interface IndependentStat {
  readonly tools_observed_drifting: number;
  readonly servers: number;
  readonly safety_relevant: number;
  readonly silent_same_version?: number; // same evidence gate as the total
  readonly context_surfaces_drifting?: number;
  readonly fleet_changes: number; // publisher-wide tool-plane events
  readonly fleet_tools: number; // distinct tools inside them
  readonly fleet_servers: number; // distinct servers inside them
  readonly context_fleet_changes: number;
  readonly context_fleet_surfaces: number;
}

// One server's share of a publisher-wide change: exactly what aggregateServerDrift needs so a
// member server's /api/v1/server-drift answer is the same under /3 as under /2.
export interface FleetMember {
  readonly server_fp: string;
  // This server's tools that have NO independent event, each assigned by the drain to exactly
  // one fleet event, so summing page_tools across events never counts a tool twice.
  readonly page_tools: number;
  readonly last_seen: string;
  readonly safety_relevant: boolean;
  readonly toolset_replaced: boolean;
  // Behind the drain's evidence interlock, like LedgerEvent.version_delta: absent is not zero.
  // They cover the page_tools tools only (a tool with an independent event carries its own
  // version_delta there), so together they can never exceed page_tools.
  readonly version_same?: number;
  readonly version_changed?: number;
  readonly version_undeclared?: number;
}

// One publisher making a change of the same kind(s) on at least 10 of its servers on one UTC day.
// "Of the same kind", never "the same change": the drain groups on kinds, not schema paths.
export interface FleetEvent {
  readonly plane: 'tool' | 'context';
  // A keyed hash of the registry namespace under the public drift key: recomputable by anyone,
  // a join key, not anonymity (the same property server_fp has).
  readonly publisher_fp: string;
  readonly day: string; // YYYY-MM-DD, UTC
  readonly change_kinds: readonly string[];
  readonly safety_relevant: boolean;
  readonly servers: number;
  readonly tools: number; // distinct tools (context plane: surfaces)
  readonly members: readonly FleetMember[];
  // Safety-relevant tool-plane events list their tools, so anyone auditing pinned tools against
  // the ledger still finds them after they leave `events`. Absent otherwise.
  readonly tool_fps?: readonly string[];
}

export interface Ledger {
  readonly schema: string; // LEDGER_SCHEMA or LEDGER_SCHEMA_V3, passed through from the blob
  readonly generated_at: string;
  readonly framing: string;
  readonly stat: LedgerStat;
  readonly events: readonly LedgerEvent[];
  // ADDITIVE on schema /2: [] for a blob that predates the drain's context emit leg.
  readonly context_events: readonly ContextEvent[];
  // /3 only. The key is ABSENT on a /2 ledger, so /api/v1/ledger serves a /2 blob byte for byte
  // as it did before /3 existed.
  readonly fleet_events?: readonly FleetEvent[];
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
    // Tool kinds only: coerceChangeKinds also accepts the context-surface kinds (they share
    // the coercion allowlist), but a tool row labeled 'instructions-changed' would be a
    // cross-plane misattribution - the drain never emits that, so a blob that carries it is
    // malformed and the kind is dropped. [] for an old blob.
    change_kinds: coerceChangeKinds(e.change_kinds).filter((k) => SURFACE_CHANGE_KINDS.has(k)),
    ...(scope ? { removal_scope: scope } : {}),
    ...(vdelta ? { version_delta: vdelta } : {}),
  };
}

export function coerceContextEvent(x: unknown): ContextEvent | null {
  if (!x || typeof x !== 'object') return null;
  const e = x as Record<string, unknown>;
  // Stricter than the tool-event blanking of server_fp: a context event carries no other
  // identity, so an invalid server_fp makes the whole row unrenderable - drop it.
  const server_fp = typeof e.server_fp === 'string' ? e.server_fp : '';
  if (!FP_RE.test(server_fp)) return null;
  // Context kinds only. A row whose kinds all fail the allowlist says nothing displayable
  // (and a tool kind here would mean a taxonomy breach upstream) - drop rather than render
  // an empty "something changed" chip row.
  const change_kinds = coerceChangeKinds(e.change_kinds).filter((k) =>
    CONTEXT_SURFACE_CHANGE_KINDS.has(k),
  );
  if (change_kinds.length === 0) return null;
  const sources = Number(e.sources);
  const last_seen = typeof e.last_seen === 'string' && TS_RE.test(e.last_seen) ? e.last_seen : '';
  return {
    server_fp,
    sources: Number.isFinite(sources) && sources >= 1 ? Math.floor(sources) : 1,
    safety_relevant: e.safety_relevant === true,
    last_seen,
    change_kinds,
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
  const ctx = s.context_surfaces_drifting;
  const ctxN = Number(ctx);
  return {
    tools_observed_drifting: n(s.tools_observed_drifting),
    total_contract_drifts_observed: n(s.total_contract_drifts_observed),
    servers: n(s.servers),
    safety_relevant: n(s.safety_relevant),
    ...(silent !== undefined && Number.isFinite(silentN) && silentN >= 0
      ? { silent_same_version: Math.floor(silentN) }
      : {}),
    ...(ctx !== undefined && Number.isFinite(ctxN) && ctxN >= 0
      ? { context_surfaces_drifting: Math.floor(ctxN) }
      : {}),
  };
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// /3 is read FAIL-CLOSED. Under /3 a tool whose only change was publisher-wide exists nowhere but
// in its fleet membership, so a dropped event or member is a server silently reading "no changes"
// on /api/v1/server-drift: the false clean this surface exists to prevent. Anything structurally
// wrong therefore rejects the whole blob (null -> 503 "not published right now", which the
// mcpindex-drift-ledger probe pages on) instead of being filtered out. Unknown change KINDS are the
// one exception: a drain that learns a new kind before this reader does must not take the ledger
// down, so the kind is dropped from display and the event and its counts are kept.

/** Thrown inside /3 coercion; parseLedgerBlob turns it into null. Never escapes this module. */
class LedgerV3Invalid extends Error {}
const bad = (why: string): never => {
  throw new LedgerV3Invalid(why);
};

// Ceilings from the honest maxima, with room: the registry crawl covers about 22k servers today.
// Hitting one is a parse failure, never a silent truncation (a truncated member list is a false
// clean for every server past the cut).
const MAX_FLEET_EVENTS = 10_000;
const MAX_MEMBERS_PER_EVENT = 50_000;
const MAX_MEMBERS_TOTAL = 200_000;
const MAX_TOOL_FPS_PER_EVENT = 200_000;
const MAX_TOOL_FPS_TOTAL = 500_000;
const MAX_COUNT = 10_000_000;

/** A real non-negative integer under MAX_COUNT, or undefined. Stricter than coerceStat's `n` on
 * purpose: Number('') is 0 and Number([7]) is 7, and neither is a count the drain wrote. */
function count(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT ? v : undefined;
}

function coerceFleetMemberStrict(x: unknown): FleetMember {
  if (!x || typeof x !== 'object') return bad('member is not an object');
  const m = x as Record<string, unknown>;
  const server_fp = typeof m.server_fp === 'string' ? m.server_fp : '';
  if (!FP_RE.test(server_fp)) return bad('member server_fp');
  const page_tools = count(m.page_tools);
  if (page_tools === undefined) return bad('member page_tools');
  const version: Record<string, number> = {};
  for (const k of ['version_same', 'version_changed', 'version_undeclared'] as const) {
    if (m[k] === undefined) continue; // behind the evidence interlock: absent is not zero
    const c = count(m[k]);
    if (c === undefined) return bad(`member ${k}`);
    version[k] = c;
  }
  const versioned = Object.values(version).reduce((n, v) => n + v, 0);
  if (versioned > page_tools) return bad('member version counts exceed page_tools');
  return {
    server_fp,
    page_tools,
    last_seen: typeof m.last_seen === 'string' && TS_RE.test(m.last_seen) ? m.last_seen : '',
    safety_relevant: m.safety_relevant === true,
    toolset_replaced: m.toolset_replaced === true,
    ...version,
  };
}

function coerceFleetEventStrict(x: unknown): FleetEvent {
  if (!x || typeof x !== 'object') return bad('fleet event is not an object');
  const e = x as Record<string, unknown>;
  const plane = e.plane === 'tool' || e.plane === 'context' ? e.plane : bad('plane');
  const publisher_fp = typeof e.publisher_fp === 'string' && FP_RE.test(e.publisher_fp) ? e.publisher_fp : bad('publisher_fp');
  const day = typeof e.day === 'string' && DAY_RE.test(e.day) ? e.day : bad('day');
  // Per-plane allowlist, the same cross-plane rule as coerceEvent. Kinds this reader does not
  // know are dropped from display; the event stays (see the note above).
  const allow = plane === 'tool' ? SURFACE_CHANGE_KINDS : CONTEXT_SURFACE_CHANGE_KINDS;
  const change_kinds = coerceChangeKinds(e.change_kinds).filter((k) => allow.has(k));
  if (!Array.isArray(e.members)) return bad('members');
  if (e.members.length > MAX_MEMBERS_PER_EVENT) return bad('members cap');
  const members = e.members.map(coerceFleetMemberStrict);
  if (new Set(members.map((m) => m.server_fp)).size !== members.length) return bad('duplicate member');
  const servers = count(e.servers) ?? bad('servers');
  const tools = count(e.tools) ?? bad('tools');
  if (servers < members.length) return bad('servers < members');
  let tool_fps: string[] | undefined;
  if (e.tool_fps !== undefined) {
    if (!Array.isArray(e.tool_fps) || e.tool_fps.length > MAX_TOOL_FPS_PER_EVENT) return bad('tool_fps');
    tool_fps = e.tool_fps.map((f) => (typeof f === 'string' && FP_RE.test(f) ? f : bad('tool_fp')));
  }
  return {
    plane,
    publisher_fp,
    day,
    change_kinds,
    safety_relevant: e.safety_relevant === true,
    servers,
    tools,
    members,
    ...(tool_fps !== undefined ? { tool_fps } : {}),
  };
}

/** One fleet event, or null if it is malformed. Exported for tests; the live path is strict. */
export function coerceFleetEvent(x: unknown): FleetEvent | null {
  try {
    return coerceFleetEventStrict(x);
  } catch (err) {
    if (err instanceof LedgerV3Invalid) return null;
    throw err;
  }
}

/** One fleet member, or null if it is malformed. Exported for tests; the live path is strict. */
export function coerceFleetMember(x: unknown): FleetMember | null {
  try {
    return coerceFleetMemberStrict(x);
  } catch (err) {
    if (err instanceof LedgerV3Invalid) return null;
    throw err;
  }
}

/** The `independent` twin, or undefined. All-or-nothing: a twin that is partly missing, or that
 * exceeds the total it is a subset of, or disagrees with the fleet list it summarises, would put
 * a wrong number on a public page. The pages fall back to the every-tool copy when this is
 * undefined; that copy is still true under /3, because every total keeps its /2 meaning. */
export function coerceIndependent(
  x: unknown,
  total: LedgerStat,
  fleets?: readonly FleetEvent[],
): IndependentStat | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const s = x as Record<string, unknown>;
  const req = {
    tools_observed_drifting: count(s.tools_observed_drifting),
    servers: count(s.servers),
    safety_relevant: count(s.safety_relevant),
    fleet_changes: count(s.fleet_changes),
    fleet_tools: count(s.fleet_tools),
    fleet_servers: count(s.fleet_servers),
    context_fleet_changes: count(s.context_fleet_changes),
    context_fleet_surfaces: count(s.context_fleet_surfaces),
  };
  if (Object.values(req).some((v) => v === undefined)) return undefined;
  const r = req as { [K in keyof typeof req]: number };
  const silent = s.silent_same_version === undefined ? undefined : count(s.silent_same_version);
  if (s.silent_same_version !== undefined && silent === undefined) return undefined;
  const ctx = s.context_surfaces_drifting === undefined ? undefined : count(s.context_surfaces_drifting);
  if (s.context_surfaces_drifting !== undefined && ctx === undefined) return undefined;
  const within =
    r.tools_observed_drifting <= total.tools_observed_drifting &&
    r.servers <= total.servers &&
    r.safety_relevant <= total.safety_relevant &&
    r.safety_relevant <= r.tools_observed_drifting &&
    r.fleet_tools <= total.tools_observed_drifting &&
    r.fleet_servers <= total.servers &&
    // Every surfaced tool is either outside publisher-wide changes or inside one, so the two
    // parts must cover the total (overlap makes the sum larger, never smaller).
    r.tools_observed_drifting + r.fleet_tools >= total.tools_observed_drifting &&
    r.servers + r.fleet_servers >= total.servers &&
    (r.fleet_changes > 0) === (r.fleet_tools > 0) &&
    (r.fleet_changes > 0) === (r.fleet_servers > 0) &&
    (silent === undefined ||
      (total.silent_same_version !== undefined &&
        silent <= total.silent_same_version &&
        silent <= r.tools_observed_drifting)) &&
    (ctx === undefined ||
      (total.context_surfaces_drifting !== undefined && ctx <= total.context_surfaces_drifting)) &&
    (total.context_surfaces_drifting === undefined ||
      r.context_fleet_surfaces <= total.context_surfaces_drifting);
  if (!within) return undefined;
  if (fleets) {
    // The twin summarises the fleet list it ships with; if they disagree, one of them is wrong.
    const toolFleets = fleets.filter((f) => f.plane === 'tool').length;
    if (r.fleet_changes !== toolFleets || r.context_fleet_changes !== fleets.length - toolFleets) return undefined;
  }
  return {
    ...r,
    ...(silent !== undefined ? { silent_same_version: silent } : {}),
    ...(ctx !== undefined ? { context_surfaces_drifting: ctx } : {}),
  };
}

/** Validate a raw Upstash value (string OR already-parsed object, per `automaticDeserialization`)
 * into a Ledger. Returns null for a missing/unparseable/wrong-schema blob. Pure + exported so the
 * branchy parsing (the live data path) is unit-testable without a Redis. Never throws.
 *
 * A /2 blob yields exactly the object it always did: no `fleet_events` key and no
 * `stat.independent`, even if the blob carries them, because /2 never promised either. */
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
  // Refuse an unknown schema version.
  if (blob.schema !== LEDGER_SCHEMA && blob.schema !== LEDGER_SCHEMA_V3) return null;
  const v3 = blob.schema === LEDGER_SCHEMA_V3;
  const events = Array.isArray(blob.events)
    ? blob.events.map(coerceEvent).filter((e): e is LedgerEvent => e !== null)
    : [];
  const context_events = Array.isArray(blob.context_events)
    ? blob.context_events
        // Honest worst case is one row per drifting server; a blob claiming far more is
        // malformed or hostile, and /api/v1/ledger serializes whatever survives parsing,
        // so cap before coercion rather than let a giant array through per request.
        .slice(0, 25_000)
        .map(coerceContextEvent)
        .filter((e): e is ContextEvent => e !== null)
    : [];
  const stat = coerceStat(blob.stat);
  if (!v3) {
    return {
      schema: LEDGER_SCHEMA,
      generated_at: clampStr(blob.generated_at, 32), // ISO timestamp; bounded
      framing: clampStr(blob.framing, 280), // one honest sentence; bounded
      stat,
      events,
      context_events,
    };
  }
  let fleet_events: FleetEvent[];
  try {
    if (!Array.isArray(blob.fleet_events)) return bad('fleet_events missing');
    if (blob.fleet_events.length > MAX_FLEET_EVENTS) return bad('fleet_events cap');
    fleet_events = blob.fleet_events.map(coerceFleetEventStrict);
    const members = fleet_events.reduce((n, f) => n + f.members.length, 0);
    const toolFps = fleet_events.reduce((n, f) => n + (f.tool_fps?.length ?? 0), 0);
    if (members > MAX_MEMBERS_TOTAL || toolFps > MAX_TOOL_FPS_TOTAL) return bad('total cap');
  } catch (err) {
    if (err instanceof LedgerV3Invalid) return null; // fail closed: "not published", never partial
    throw err;
  }
  const independent = coerceIndependent(
    (blob.stat && typeof blob.stat === 'object' ? (blob.stat as Record<string, unknown>) : {})
      .independent,
    stat,
    fleet_events,
  );
  return {
    schema: LEDGER_SCHEMA_V3,
    generated_at: clampStr(blob.generated_at, 32),
    framing: clampStr(blob.framing, 280),
    stat: independent ? { ...stat, independent } : stat,
    events,
    context_events,
    fleet_events,
  };
}
