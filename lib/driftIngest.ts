// Drift-telemetry ingest (M1) - the minimal server side of the usage-log drift flywheel.
//
// Two jobs: (1) STRICTLY validate the closed DriftSignal shape - this is the server-side
// privacy BACKSTOP. The client emits only fingerprints/hashes/enums by construction; the
// schema re-asserts it on the wire, so even a future client bug cannot land a raw tool
// string here: server_fp/tool_fp must be exactly 32 hex, hashes are `algo:hex`, change
// kinds are a bounded lowercase-token vocabulary, at_hour is a fixed format or empty, and
// `.strict()` rejects ANY unexpected key. (2) Fold each batch into best-effort counters:
// distinct installs (the opt-in falsifier metric), distinct servers covered, and per-event
// tallies. Counters are fail-OPEN on a Redis hiccup - we never reject a valid batch over our
// own infra, but we also never persist a signal we could not validate.

import 'server-only';
import { z } from 'zod';
import { Redis } from '@upstash/redis';
import { redisUrl, redisToken } from './env';
import { flag } from './flags';

const HEX32 = /^[0-9a-f]{32}$/;
const HASH = /^[a-z0-9]+:[0-9a-f]{32,128}$/; // e.g. sha256:<64 hex>
const KIND = /^[a-z0-9-]{1,64}$/; // schema_diff ChangeKind values: lowercase + hyphen
const AT_HOUR = /^(?:\d{4}-\d{2}-\d{2}T\d{2}:00:00Z)?$/; // hour-coarsened or empty
const INSTALL_ID = /^[0-9a-f]{32}$/; // both SDKs emit exactly 16 random bytes = 32 hex

export const MAX_BATCH = 256;
// Daily counter keys expire after ~35 days - enough to PFMERGE a trailing-28-day window for
// the opt-in/coverage measurement, but bounded so day-keys cannot accumulate forever.
const DAILY_TTL_S = 35 * 86_400;
// Hard ceiling on how long the (best-effort) counter write may hold the ingest response.
const EXEC_TIMEOUT_MS = 2_000;
// M2 corpus stream: each validated signal is enqueued here for the mini32 drain, which builds
// the `drift_events` corpus (Supabase) + the corroboration cache. Capped via xadd MAXLEN so a
// down drain can't grow it unbounded; the drain trims consumed entries. The stream carries the
// SAME closed, already-validated signal - no new field, no raw tool data.
const STREAM_KEY = 'drift:stream';
const STREAM_MAXLEN = 100_000;
// Hints are best-effort tips for the mini32 recrawl worker. SET semantics dedup by fp.
// A lost hint self-heals at the next daily crawl. fps are already-public-salt material
// (no new data class leaves).
const RECRAWL_HINTS_KEY = 'drift:recrawl:hints';
const RECRAWL_HINTS_TTL_S = 24 * 60 * 60;

export const DriftSignalSchema = z
  .object({
    v: z.literal(1),
    event: z.enum(['pin', 'drift']),
    server_fp: z.string().regex(HEX32),
    tool_fp: z.string().regex(HEX32),
    prev_hash: z.string().regex(HASH).nullable(),
    new_hash: z.string().regex(HASH),
    change_kinds: z.array(z.string().regex(KIND)).max(64).nullable(),
    safety_relevant: z.boolean(),
    at_hour: z.string().regex(AT_HOUR),
    sdk: z.enum(['ts', 'py']),
    install_id: z.string().regex(INSTALL_ID),
  })
  .strict();

export const DriftBatchSchema = z
  .object({ signals: z.array(DriftSignalSchema).min(1).max(MAX_BATCH) })
  .strict();

export type DriftSignal = z.infer<typeof DriftSignalSchema>;

let _redis: Redis | null | undefined;

/** @internal test seam: inject Redis (or null); pass undefined to reset lazy init. */
export function __setDriftIngestRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  // retries:1 bounds the REST client's default 5-retry exponential backoff - a Redis incident
  // must not stack ~11s of retries onto the ingest response (see EXEC_TIMEOUT_MS below).
  _redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  return _redis;
}

// Fold a validated batch into cumulative + daily counters. Best-effort: any Redis error is
// swallowed (the caller already 204'd the client). Distinct installs/servers use HyperLogLog
// (PFADD) so cardinality is O(1) space regardless of volume - exactly the opt-in-rate and
// coverage numbers the M1 falsifier needs, with no per-signal row retained.
export async function recordDriftBatch(
  signals: DriftSignal[],
  now: Date,
  authedInstalls: ReadonlySet<string> = new Set(),
): Promise<void> {
  const r = redis();
  if (!r) return;
  const day = now.toISOString().slice(0, 10); // yyyy-mm-dd
  try {
    const pins = signals.filter((s) => s.event === 'pin');
    const drifts = signals.filter((s) => s.event === 'drift');
    const safety = drifts.filter((s) => s.safety_relevant);
    const installs = [...new Set(signals.map((s) => s.install_id))];
    const servers = [...new Set(signals.map((s) => s.server_fp))];

    const p = r.pipeline();
    p.incrby('drift:signals:total', signals.length);
    p.incrby(`drift:signals:${day}`, signals.length);
    p.expire(`drift:signals:${day}`, DAILY_TTL_S);
    if (pins.length) p.incrby('drift:event:pin', pins.length);
    if (drifts.length) p.incrby('drift:event:drift', drifts.length);
    if (safety.length) p.incrby('drift:safety_relevant', safety.length);
    if (installs.length) {
      p.pfadd('drift:installs', ...installs);
      p.pfadd(`drift:installs:${day}`, ...installs);
      p.expire(`drift:installs:${day}`, DAILY_TTL_S);
    }
    if (servers.length) p.pfadd('drift:servers', ...servers);

    // M2 corpus enqueue: stream each validated signal for the drain (best-effort, same
    // fail-open as the counters; rides the same pipeline + timeout race below).
    for (const s of signals) {
      p.xadd(
        STREAM_KEY,
        '*',
        { d: JSON.stringify(s), auth: authedInstalls.has(s.install_id) ? '1' : '0' },
        { trim: { type: 'MAXLEN', threshold: STREAM_MAXLEN, comparison: '~' } },
      );
    }

    if (flag('DRIFT_RECRAWL_HINTS') && drifts.length) {
      const fps = [...new Set(drifts.map((s) => s.tool_fp))];
      p.sadd(RECRAWL_HINTS_KEY, ...(fps as [string, ...string[]]));
      // NX: set the TTL only if the key has none yet. A bare `expire` on every batch SLID
      // the window forward continuously, so under steady drift traffic the 24h bound was
      // never reached and the set grew to whatever the recrawl worker failed to consume.
      // With NX the 24h is measured from the FIRST hint, which is what bounds the set.
      p.expire(RECRAWL_HINTS_KEY, RECRAWL_HINTS_TTL_S, 'NX');
    }

    // Bound how long the counter write can hold the ingest response. The route awaits this
    // before its 204, so a hung Upstash must not stall the request: race the pipeline against
    // a timeout (the pipeline pre-swallows its own late rejection so it can lose harmlessly).
    const exec = p.exec().then(
      () => undefined,
      () => undefined,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, EXEC_TIMEOUT_MS);
    });
    await Promise.race([exec, timeout]);
    clearTimeout(timer);
  } catch {
    // fail-open: counters are best-effort; never surface a Redis hiccup to the client
  }
}
