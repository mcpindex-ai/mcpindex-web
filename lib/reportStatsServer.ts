// Server-only IO for the drift report stats (build plan #11, read side). Holds the Upstash REST
// token, so it is guarded by `import 'server-only'`: importing this into a client component is a
// HARD BUILD ERROR (the pure validation + the public flag live in ./reportStats, safe anywhere).
// Style-match: lib/ledgerServer.ts.

import 'server-only';
import { Redis } from '@upstash/redis';
import { ledgerEnabled } from './ledger';
import { driftReportEnabled, parseReportStatsBlob, type ReportStats } from './reportStats';

const REPORT_STATS_KEY = 'drift:report-stats';

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

/** TEST-ONLY seam (mirrors ledgerServer): override the client so a suite can drive the live-data
 * path (get(REPORT_STATS_KEY) returns a valid blob) without a live Redis. */
export function __setReportStatsRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

/** Read + validate the published report-stats blob. Returns null when either gate flag is off,
 * the cache is unavailable, or the blob is missing/malformed - the page treats null as "live
 * counters unavailable" and renders the frozen Edition v1 numbers instead. Fail-CLOSED on shape
 * (a corrupt blob never renders), never throws. The branchy parsing is in `parseReportStatsBlob`
 * (./reportStats), unit-tested without a Redis. */
export async function loadReportStats(): Promise<ReportStats | null> {
  if (!driftReportEnabled() || !ledgerEnabled()) return null;
  const r = redis();
  if (!r) return null;
  let raw: unknown;
  try {
    raw = await r.get(REPORT_STATS_KEY);
  } catch {
    return null; // cache hiccup => fall back to the frozen edition, never a stale lie
  }
  return parseReportStatsBlob(raw);
}
