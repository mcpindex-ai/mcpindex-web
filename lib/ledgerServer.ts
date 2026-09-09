// Server-only IO for the drift ledger (M4, read side). Holds the Upstash REST token, so it is
// guarded by `import 'server-only'`: importing this into a client component is a HARD BUILD ERROR
// (the pure validation + the public flag live in ./ledger, which is safe to import anywhere).

import 'server-only';
import { gunzipSync } from 'node:zlib';
import { Redis } from '@upstash/redis';
import { ledgerEnabled, parseLedgerBlob, type Ledger } from './ledger';
import { redisUrl, redisToken } from './env';

const LEDGER_KEY = 'drift:ledger';

// Wire format marker for a gzipped blob. The drain SETs `gz1:<base64(gzip(json))>` when
// MCPINDEX_LEDGER_GZIP is on, and the plain JSON string when it is off; both are accepted here
// forever, because the reader has to survive a drain rollback without a redeploy.
//
// WHY. The blob crossed 5,397,238B on 2026-09-08 and tripped the mcpindex-ledger-size probe at
// half of Upstash's 10MB request cap. Measured growth over the 40 days from the 2026-07-30
// datapoint is 98.5KB/day, so the uncompressed blob hits the cap around late October and the
// hourly SET starts 400ing. gzip of that exact blob measures 8.66x (5,397,238B -> 623,539B,
// ~831KB after base64), which is years of headroom and shrinks every ISR revalidation and every
// server-page build read by the same factor. Nothing a consumer sees changes: /api/v1/ledger
// still emits the same mcpindex.drift.ledger/2 JSON.
//
// This is deliberately NOT the bounded-blob + paginated-history redesign in
// tasks/mcpindex-drift-receipt-pipeline-ops.md. That one breaks a published API AND breaks
// loadServerDrift, which needs every row to answer for any of 3,097 servers and would need a
// per-server rollup published first.
const GZIP_PREFIX = 'gz1:';

// Decompression bound. The live blob is ~5.4MB; 64MB is ~12x that and still small enough that a
// hostile or corrupt value cannot turn one Upstash read into an OOM. gunzipSync throws on
// overflow, which decodeLedgerRaw turns into null (= "not published"), never a partial parse.
const MAX_DECODED_BYTES = 64 * 1024 * 1024;

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

/** TEST-ONLY seam (mirrors the drift/receipt modules): override the client so a suite can drive the
 * ledger 200 path (get(LEDGER_KEY) returns a valid blob) without a live Redis. */
export function __setLedgerServerRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

/** Read + validate the published ledger blob. Returns null when the flag is off, the cache is
 * unavailable, or the blob is missing/malformed - the page/API treat null as "not published".
 * Fail-CLOSED on shape (a corrupt blob is not published), but never throws. The branchy parsing
 * is in `parseLedgerBlob` (./ledger), which is unit-tested without a Redis. */
/** Turn whatever Upstash returned into something parseLedgerBlob can read.
 *
 * Three shapes reach here: a `gz1:` string (the compressed form), a plain JSON string, and an
 * already-parsed object (@upstash/redis auto-deserializes a value that happens to be valid JSON).
 * Only the first is new; the other two fall straight through to today's behaviour.
 *
 * Returns null rather than throwing on any bad gzip - truncated, not-actually-gzip, or over the
 * decompression bound. A corrupt blob is "not published right now", which is what every other
 * failure on this path already resolves to.
 *
 * Exported for the route suite; not part of the module's real surface. */
export function decodeLedgerRaw(raw: unknown): unknown {
  if (typeof raw !== 'string' || !raw.startsWith(GZIP_PREFIX)) return raw;
  try {
    const gz = Buffer.from(raw.slice(GZIP_PREFIX.length), 'base64');
    // Buffer.from ignores invalid base64 characters rather than throwing, so an empty result is
    // the only signal that the payload was junk. gunzipSync catches everything else.
    if (gz.length === 0) return null;
    return gunzipSync(gz, { maxOutputLength: MAX_DECODED_BYTES }).toString('utf8');
  } catch {
    return null;
  }
}

export async function loadLedger(): Promise<Ledger | null> {
  if (!ledgerEnabled()) return null;
  let raw: unknown;
  try {
    // redis() must be INSIDE the try: the Upstash client throws UrlError from its
    // constructor on a malformed REST URL (e.g. a rediss:// value pasted into
    // UPSTASH_REDIS_REST_URL). Constructing it outside meant that misconfiguration
    // escaped loadLedger and 500'd every caller, including /scan, whose tool does not
    // need the ledger at all.
    const r = redis();
    if (!r) return null;
    raw = await r.get(LEDGER_KEY);
  } catch {
    return null; // cache hiccup => "not published right now", never a stale lie
  }
  return parseLedgerBlob(decodeLedgerRaw(raw));
}
