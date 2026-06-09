// Opt-in drift telemetry aggregate counters (M5, read side). Reads the counters the ingest
// maintains in Upstash: signal totals, event counts, and HyperLogLog cardinality for installs
// and servers. Fail-CLOSED-to-null when Redis is unconfigured or any read throws — the dashboard
// treats null as "metrics unavailable", never a fabricated zero.

import { Redis } from '@upstash/redis';

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

export interface DriftStats {
  signalsTotal: number;
  pins: number;
  drifts: number;
  safetyRelevant: number;
  optedInInstalls: number;
  serversCovered: number;
}

export function coerceNonNegInt(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/** Read aggregate drift counters. Returns null when Redis is unavailable or any read fails. */
export async function loadDriftStats(): Promise<DriftStats | null> {
  const r = redis();
  if (!r) return null;
  try {
    const p = r.pipeline();
    p.get('drift:signals:total');
    p.get('drift:event:pin');
    p.get('drift:event:drift');
    p.get('drift:safety_relevant');
    p.pfcount('drift:installs');
    p.pfcount('drift:servers');
    const [signalsTotal, pins, drifts, safetyRelevant, optedInInstalls, serversCovered] =
      await p.exec();
    return {
      signalsTotal: coerceNonNegInt(signalsTotal),
      pins: coerceNonNegInt(pins),
      drifts: coerceNonNegInt(drifts),
      safetyRelevant: coerceNonNegInt(safetyRelevant),
      optedInInstalls: coerceNonNegInt(optedInInstalls),
      serversCovered: coerceNonNegInt(serversCovered),
    };
  } catch {
    return null;
  }
}
