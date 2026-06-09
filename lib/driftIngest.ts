// Drift-telemetry ingest (M1) — the minimal server side of the usage-log drift flywheel.
//
// Two jobs: (1) STRICTLY validate the closed DriftSignal shape — this is the server-side
// privacy BACKSTOP. The client emits only fingerprints/hashes/enums by construction; the
// schema re-asserts it on the wire, so even a future client bug cannot land a raw tool
// string here: server_fp/tool_fp must be exactly 32 hex, hashes are `algo:hex`, change
// kinds are a bounded lowercase-token vocabulary, at_hour is a fixed format or empty, and
// `.strict()` rejects ANY unexpected key. (2) Fold each batch into best-effort counters:
// distinct installs (the opt-in falsifier metric), distinct servers covered, and per-event
// tallies. Counters are fail-OPEN on a Redis hiccup — we never reject a valid batch over our
// own infra, but we also never persist a signal we could not validate.

import { z } from 'zod';
import { Redis } from '@upstash/redis';

const HEX32 = /^[0-9a-f]{32}$/;
const HASH = /^[a-z0-9]+:[0-9a-f]{32,128}$/; // e.g. sha256:<64 hex>
const KIND = /^[a-z0-9-]{1,64}$/; // schema_diff ChangeKind values: lowercase + hyphen
const AT_HOUR = /^(?:\d{4}-\d{2}-\d{2}T\d{2}:00:00Z)?$/; // hour-coarsened or empty
const INSTALL_ID = /^[0-9a-f]{32}$/; // both SDKs emit exactly 16 random bytes = 32 hex

export const MAX_BATCH = 256;

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
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

// Fold a validated batch into cumulative + daily counters. Best-effort: any Redis error is
// swallowed (the caller already 204'd the client). Distinct installs/servers use HyperLogLog
// (PFADD) so cardinality is O(1) space regardless of volume — exactly the opt-in-rate and
// coverage numbers the M1 falsifier needs, with no per-signal row retained.
export async function recordDriftBatch(signals: DriftSignal[], now: Date): Promise<void> {
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
    if (pins.length) p.incrby('drift:event:pin', pins.length);
    if (drifts.length) p.incrby('drift:event:drift', drifts.length);
    if (safety.length) p.incrby('drift:safety_relevant', safety.length);
    if (installs.length) {
      p.pfadd('drift:installs', ...installs);
      p.pfadd(`drift:installs:${day}`, ...installs);
    }
    if (servers.length) p.pfadd('drift:servers', ...servers);
    await p.exec();
  } catch {
    // fail-open: counters are best-effort; never surface a Redis hiccup to the client
  }
}
