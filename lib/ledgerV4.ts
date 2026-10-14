// Ledger /4: the paged public API. The drain (mcpindex-trust) publishes each generation as pages
// under `drift:ledger:v4:<gen>:<section>:<n>` plus one index written last, and stopped publishing
// the full `drift:ledger` blob, which crossed 10MB and which /3 served whole on every request.
//
//   drift:ledger:v4:index                     gen, generated_at, framing, stat, ledger_schema,
//                                             digest, page count per section, row counts
//   drift:ledger:v4:<gen>:<section>:<n>       up to 1,000 /3 rows (fleet_events: packed by size)
//
// A superseded generation's pages expire 7,200s after the next one is published, so a cursor
// keeps working for at least an hour and then answers 410. A generation id is the publish time as
// YYYYMMDDTHHMMSSZ, a dash and 8 lowercase hex. PURE: cursor codec and validation only. The
// Upstash IO is in ledgerServer.ts.

import {
  LEDGER_SCHEMA,
  LEDGER_SCHEMA_V3,
  coerceContextEvent,
  coerceEvent,
  coerceFleetEvent,
  coerceIndependent,
  coerceStat,
  type ContextEvent,
  type FleetEvent,
  type LedgerEvent,
  type LedgerStat,
} from './ledger';
import { generatedAtIsFresh } from './ledgerSplit';

export const LEDGER_SCHEMA_V4 = 'mcpindex.drift.ledger/4';
export const LEDGER_INDEX_SCHEMA = 'mcpindex.drift.ledger-index/1';
export const LEDGER_PAGE_SCHEMA = 'mcpindex.drift.ledger-page/1';
export const LEDGER_INDEX_KEY = 'drift:ledger:v4:index';

export const LEDGER_SECTIONS = ['events', 'context_events', 'fleet_events'] as const;
export type LedgerSection = (typeof LEDGER_SECTIONS)[number];

// Measured on the live /3 blob 2026-10-14: 33,236 events (34 pages of 1,000). The ceiling is a
// bound on what a cursor or an index may claim, far above any honest value.
export const MAX_PAGES = 100_000;
// events and context_events pages hold 1,000 rows by spec; fleet pages are packed by size and
// hold at least one row, so their bound is the /3 fleet-event ceiling.
const MAX_ROWS_PER_PAGE: Record<LedgerSection, number> = {
  events: 1_000,
  context_events: 1_000,
  fleet_events: 10_000,
};
// A cursor is base64url of about 50 ASCII bytes; anything far longer is not one of ours.
const MAX_CURSOR_LEN = 128;

// Every gen that reaches a Redis key has matched this, whether it came from a cursor or the index.
export const GEN_RE = /^\d{8}T\d{6}Z-[0-9a-f]{8}$/;
const CURSOR_BODY_RE =
  /^(\d{8}T\d{6}Z-[0-9a-f]{8})\.(events|context_events|fleet_events)\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export function isLedgerSection(v: string): v is LedgerSection {
  return (LEDGER_SECTIONS as readonly string[]).includes(v);
}

/** generated_at in the form that starts a generation id: YYYYMMDDTHHMMSSZ. Null for a non-date. */
export function genStampOf(generatedAt: string): string | null {
  const ms = Date.parse(generatedAt);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
}

/** The Redis key of one page. Only ever called with parts that passed GEN_RE and the section
 * allowlist, so nothing a client sends reaches the key unvalidated. */
export function pageKey(gen: string, section: LedgerSection, n: number): string {
  return `drift:ledger:v4:${gen}:${section}:${n}`;
}

/** Where a client is in one section of one generation. `pages` rides along so a cursor into a
 * superseded generation, whose index is gone, still knows where that generation ends. */
export interface LedgerCursor {
  readonly gen: string;
  readonly section: LedgerSection;
  readonly n: number;
  readonly pages: number;
}

export function encodeCursor(c: LedgerCursor): string {
  return Buffer.from(`${c.gen}.${c.section}.${c.n}.${c.pages}`, 'utf8').toString('base64url');
}

/** Null for anything that is not exactly a cursor this module would have produced. */
export function decodeCursor(raw: string): LedgerCursor | null {
  if (raw.length === 0 || raw.length > MAX_CURSOR_LEN || !B64URL_RE.test(raw)) return null;
  const m = CURSOR_BODY_RE.exec(Buffer.from(raw, 'base64url').toString('utf8'));
  if (!m) return null;
  const c: LedgerCursor = { gen: m[1], section: m[2] as LedgerSection, n: Number(m[3]), pages: Number(m[4]) };
  if (!GEN_RE.test(c.gen) || c.pages > MAX_PAGES || c.n >= c.pages) return null;
  // Canonical form only: base64url has more than one spelling of some inputs.
  return encodeCursor(c) === raw ? c : null;
}

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

function pageCount(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_PAGES ? v : undefined;
}

export interface LedgerIndex {
  readonly gen: string;
  readonly generated_at: string;
  readonly ledger_schema: string;
  readonly framing: string;
  readonly stat: LedgerStat;
  readonly digest: string;
  readonly pages: Readonly<Record<LedgerSection, number>>;
  readonly counts: Readonly<Record<string, number>>;
}

const COUNT_KEY_RE = /^[a-z_]{1,32}$/;
const MAX_COUNT_KEYS = 16;

/** Validate a decoded `drift:ledger:v4:index`. Null when missing, malformed or stale, on the
 * same freshness rule as the split summary. stat goes through the /3 coercion: counts clamped,
 * and the `independent` twin kept only on a /3 ledger and only when it holds against the totals. */
export function parseLedgerIndex(raw: unknown, nowMs: number): LedgerIndex | null {
  const x = asObject(raw);
  if (!x || x.schema !== LEDGER_INDEX_SCHEMA) return null;
  if (typeof x.gen !== 'string' || !GEN_RE.test(x.gen)) return null;
  if (typeof x.generated_at !== 'string' || x.generated_at.length > 32) return null;
  if (genStampOf(x.generated_at) !== x.gen.slice(0, 16) || !generatedAtIsFresh(x.generated_at, nowMs)) return null;
  if (x.ledger_schema !== LEDGER_SCHEMA && x.ledger_schema !== LEDGER_SCHEMA_V3) return null;
  if (typeof x.framing !== 'string' || x.framing.length > 280) return null;
  if (!x.stat || typeof x.stat !== 'object' || Array.isArray(x.stat)) return null;
  const total = coerceStat(x.stat);
  const independent =
    x.ledger_schema === LEDGER_SCHEMA_V3
      ? coerceIndependent((x.stat as Record<string, unknown>).independent, total)
      : undefined;
  const stat: LedgerStat = independent ? { ...total, independent } : total;
  if (typeof x.digest !== 'string' || x.digest.length > 128) return null;
  const p = asObject(x.pages);
  if (!p) return null;
  const pages = {} as Record<LedgerSection, number>;
  for (const s of LEDGER_SECTIONS) {
    const n = pageCount(p[s]);
    if (n === undefined) return null;
    pages[s] = n;
  }
  const c = asObject(x.counts);
  if (!c) return null;
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(c)) {
    if (!COUNT_KEY_RE.test(k) || Object.keys(counts).length >= MAX_COUNT_KEYS) return null;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return null;
    counts[k] = v;
  }
  return {
    gen: x.gen,
    generated_at: x.generated_at,
    ledger_schema: x.ledger_schema,
    framing: x.framing,
    stat,
    digest: x.digest,
    pages,
    counts,
  };
}

export type LedgerItem = LedgerEvent | ContextEvent | FleetEvent;

/** Validate a decoded page against the cursor that asked for it, then its rows with the /3
 * coercers. events and context_events drop a malformed row, as /3 did; a malformed fleet row
 * rejects the page, as it rejected the /3 blob (a dropped member is a false clean). */
export function parseLedgerPage(
  raw: unknown,
  want: { gen: string; section: LedgerSection; n: number },
): readonly LedgerItem[] | null {
  const x = asObject(raw);
  if (!x || x.schema !== LEDGER_PAGE_SCHEMA) return null;
  if (x.gen !== want.gen || x.section !== want.section || x.n !== want.n) return null;
  if (!Array.isArray(x.items) || x.items.length > MAX_ROWS_PER_PAGE[want.section]) return null;
  if (want.section === 'events') {
    return x.items.map(coerceEvent).filter((e): e is LedgerEvent => e !== null);
  }
  if (want.section === 'context_events') {
    return x.items.map(coerceContextEvent).filter((e): e is ContextEvent => e !== null);
  }
  if (x.items.length === 0) return null; // fleet pages hold at least one row
  const fleets = x.items.map(coerceFleetEvent);
  return fleets.every((f): f is FleetEvent => f !== null) ? fleets : null;
}
