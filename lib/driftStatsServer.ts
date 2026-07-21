// Server-only IO for the M5 drift counters. Holds the Upstash REST token, so it is guarded by
// `import 'server-only'`: importing it into a client component is a HARD BUILD ERROR. The pure
// DriftStats type + coercion live in ./driftStats (safe to import anywhere, unit-tested).

import 'server-only';
import { Redis } from '@upstash/redis';
import { ledgerEnabled } from './ledger';
import { coerceNonNegInt, type DriftStats } from './driftStats';
import { redisUrl, redisToken } from './env';

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

/** Read aggregate drift counters. Returns null when the flag is off, Redis is unavailable, or any
 * read fails (the dashboard treats null as "metrics unavailable", never a fabricated zero). */
export async function loadDriftStats(): Promise<DriftStats | null> {
  // Defense-in-depth: the dashboard page already 404s when the flag is off, but mirror loadLedger's
  // internal guard so a future second caller can't expose the M5 counters pre-go-live.
  if (!ledgerEnabled()) return null;
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
