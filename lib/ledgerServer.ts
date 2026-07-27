// Server-only IO for the drift ledger (M4, read side). Holds the Upstash REST token, so it is
// guarded by `import 'server-only'`: importing this into a client component is a HARD BUILD ERROR
// (the pure validation + the public flag live in ./ledger, which is safe to import anywhere).

import 'server-only';
import { Redis } from '@upstash/redis';
import { ledgerEnabled, parseLedgerBlob, type Ledger } from './ledger';
import { redisUrl, redisToken } from './env';

const LEDGER_KEY = 'drift:ledger';

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
  return parseLedgerBlob(raw);
}
