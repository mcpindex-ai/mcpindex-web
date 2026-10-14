// Server-only IO for the drift ledger (M4, read side). Holds the Upstash REST token, so it is
// guarded by `import 'server-only'`: importing this into a client component is a HARD BUILD ERROR
// (the pure validation + the public flag live in ./ledger, which is safe to import anywhere).

import 'server-only';
import { gunzipSync } from 'node:zlib';
import { Redis } from '@upstash/redis';
import { ledgerEnabled } from './ledger';
import { parseLedgerSummary, type LedgerSummary, type LedgerView } from './ledgerSplit';
import {
  LEDGER_INDEX_KEY,
  pageKey,
  parseLedgerIndex,
  parseLedgerPage,
  type LedgerIndex,
  type LedgerItem,
  type LedgerSection,
} from './ledgerV4';
import { redisUrl, redisToken } from './env';

// Every ledger read goes through the split summary, the per-server hash, or the /4 pages. The full
// `drift:ledger` blob is retired: the drain stopped publishing it, and nothing here reads it
// (lib/noFullLedgerRead.test.ts holds that).

// Wire format marker for a gzipped value: `gz1:<base64(gzip(json))>`. The plain JSON string is
// still accepted, so a drain that writes either form reads the same.
const GZIP_PREFIX = 'gz1:';

// Decompression bound for the summary and a server field. The summary is the newest 300 rows of
// each kind plus fleet heads; 64MB is far above it and still small enough that a hostile or
// corrupt value cannot turn one Upstash read into an OOM. gunzipSync throws on overflow, which
// decodeLedgerRaw turns into null (= "not published"), never a partial parse.
const MAX_DECODED_BYTES = 64 * 1024 * 1024;
// A /4 page: 1,000 events measured 245,721B decoded on 2026-10-14 and the largest fleet row
// 489,700B, so 16MB is room for growth, not a target. The index is a handful of scalar fields.
const MAX_PAGE_DECODED_BYTES = 16 * 1024 * 1024;
const MAX_INDEX_DECODED_BYTES = 1024 * 1024;

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

/** TEST-ONLY seam (mirrors the drift/receipt modules): override the client so a suite can drive the
 * summary, server-hash and /4 page paths without a live Redis. */
export function __setLedgerServerRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

/** Turn whatever Upstash returned into something the parsers can read.
 *
 * Three shapes reach here: a `gz1:` string (the compressed form), a plain JSON string, and an
 * already-parsed object (@upstash/redis auto-deserializes a value that happens to be valid JSON).
 * The last two pass straight through.
 *
 * Returns null rather than throwing on any bad gzip - truncated, not-actually-gzip, or over the
 * decompression bound. A corrupt value is "not published right now", which is what every other
 * failure on this path already resolves to.
 *
 * Exported for the route suite; not part of the module's real surface. */
export function decodeLedgerRaw(raw: unknown, maxBytes: number = MAX_DECODED_BYTES): unknown {
  // Hold the plain-string path to the same bound as the gzip path, so one oversized value cannot
  // cost a parse per request.
  if (typeof raw === 'string' && raw.length > maxBytes) return null;
  if (typeof raw !== 'string' || !raw.startsWith(GZIP_PREFIX)) return raw;
  try {
    const gz = Buffer.from(raw.slice(GZIP_PREFIX.length), 'base64');
    // Buffer.from ignores invalid base64 characters rather than throwing, so an empty result is
    // the only signal that the payload was junk. gunzipSync catches everything else.
    if (gz.length === 0) return null;
    return gunzipSync(gz, { maxOutputLength: maxBytes }).toString('utf8');
  } catch {
    return null;
  }
}

const LEDGER_SUMMARY_KEY = 'drift:ledger:summary';
const LEDGER_SERVERS_KEY = 'drift:ledger:servers';

/** The split summary (see ./ledgerSplit), or null when it is absent, stale or malformed. Never
 * throws; null means "the ledger is unavailable right now". */
export async function loadLedgerSummary(): Promise<LedgerSummary | null> {
  if (!ledgerEnabled()) return null;
  let raw: unknown;
  try {
    // redis() is inside the try: the Upstash client throws UrlError from its constructor on a
    // malformed REST URL, which must read as "unavailable", not 500 every page that calls this.
    const r = redis();
    if (!r) return null;
    raw = await r.get(LEDGER_SUMMARY_KEY);
  } catch {
    return null;
  }
  return parseLedgerSummary(decodeLedgerRaw(raw), Date.now());
}

/** What /ledger, /scan, /dashboard and the Drift Report render: the summary, or null when it is
 * missing, stale or malformed, which each page renders as its "not published" state. */
export async function loadLedgerView(): Promise<LedgerView | null> {
  return loadLedgerSummary();
}

/** HLEN of the per-server hash, or null on any failure. */
export async function loadLedgerServersCount(): Promise<number | null> {
  try {
    const r = redis();
    if (!r) return null;
    const n = await r.hlen(LEDGER_SERVERS_KEY);
    return typeof n === 'number' ? n : null;
  } catch {
    return null;
  }
}

/** One server's field: the decoded value, `null` when the server has no field (no drift), or
 * `undefined` when the read failed (the caller reports the server's drift unavailable). */
export async function loadLedgerServerField(serverFp: string): Promise<unknown> {
  try {
    const r = redis();
    if (!r) return undefined;
    const raw = await r.hget(LEDGER_SERVERS_KEY, serverFp);
    return raw === null || raw === undefined ? null : decodeLedgerRaw(raw) ?? undefined;
  } catch {
    return undefined;
  }
}

/** The /4 index, or null when it is absent, stale or malformed. Never throws. */
export async function loadLedgerIndex(): Promise<LedgerIndex | null> {
  if (!ledgerEnabled()) return null;
  let raw: unknown;
  try {
    const r = redis();
    if (!r) return null;
    raw = await r.get(LEDGER_INDEX_KEY);
  } catch {
    return null;
  }
  return parseLedgerIndex(decodeLedgerRaw(raw, MAX_INDEX_DECODED_BYTES), Date.now());
}

export type LedgerPageRead =
  | { readonly status: 'ok'; readonly items: readonly LedgerItem[] }
  | { readonly status: 'missing' } // no such key: expired generation, or never written
  | { readonly status: 'error' }; // the read failed or the page did not validate

/** One /4 page. `gen` and `section` must already be validated (decodeCursor or the index). */
export async function loadLedgerPage(gen: string, section: LedgerSection, n: number): Promise<LedgerPageRead> {
  let raw: unknown;
  try {
    const r = redis();
    if (!r) return { status: 'error' };
    raw = await r.get(pageKey(gen, section, n));
  } catch {
    return { status: 'error' };
  }
  if (raw === null || raw === undefined) return { status: 'missing' };
  const items = parseLedgerPage(decodeLedgerRaw(raw, MAX_PAGE_DECODED_BYTES), { gen, section, n });
  return items ? { status: 'ok', items } : { status: 'error' };
}
