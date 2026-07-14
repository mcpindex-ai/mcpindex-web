// Server-only IO for the drift ledger (M4, read side). Holds the Upstash REST token, so it is
// guarded by `import 'server-only'`: importing this into a client component is a HARD BUILD ERROR
// (the pure validation + the public flag live in ./ledger, which is safe to import anywhere).

import 'server-only';
import { Redis } from '@upstash/redis';
import { ledgerEnabled, parseLedgerBlob, type Ledger } from './ledger';

const LEDGER_KEY = 'drift:ledger';

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

/** TEST-ONLY seam (mirrors the drift/receipt modules): override the client so a suite can drive the
 * ledger 200 path (get(LEDGER_KEY) returns a valid blob) without a live Redis. */
export function __setLedgerServerRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

/** Read + validate the published ledger blob. Returns null when the flag is off, the cache is
 * unavailable, or the blob is missing/malformed — the page/API treat null as "not published".
 * Fail-CLOSED on shape (a corrupt blob is not published), but never throws. The branchy parsing
 * is in `parseLedgerBlob` (./ledger), which is unit-tested without a Redis. */
export async function loadLedger(): Promise<Ledger | null> {
  if (!ledgerEnabled()) return null;
  const r = redis();
  if (!r) return null;
  let raw: unknown;
  try {
    raw = await r.get(LEDGER_KEY);
  } catch {
    return null; // cache hiccup => "not published right now", never a stale lie
  }
  return parseLedgerBlob(raw);
}
