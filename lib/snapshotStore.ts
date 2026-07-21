import 'server-only';
import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import type { RegistryEntry, Snapshot } from './types';
import { redisUrl, redisToken, redisConfigured } from './env';

// Upstash KV write-through for snapshots. Cron writes after a successful
// fetch; read path tries KV first and falls back to bundled snapshot.json.
// Upstash quota is the new SPOF; the bundled-snapshot fallback mitigates it.

const KV_KEY = 'mcpindex:snapshot:v1';

export type StoredSnapshot = Snapshot & {
  snapshot_version: string;
  snapshot_written_at: string;
};

// TTL on the KV snapshot. The write path is the (manual-only) sync-registry route;
// the CANONICAL refresh is .github/workflows/sync-registry.yml, which commits
// data/snapshot.json every 4h and redeploys. Without an expiry, ONE manual cron
// invocation pinned the live site to that KV blob FOREVER: resolveSnapshotUncached
// prefers KV, the workflow kept committing fresh snapshots, and every read path
// ignored them with no TTL, no comparison, and no alarm. 6h > the 4h sync cadence
// (so a legitimately-fresh KV write is never expired out from under a working cron)
// and far below the ~36h staleness the freshness probe pages on.
const KV_TTL_SECONDS = 6 * 60 * 60;

function clientOrNull(): Redis | null {
  // Accept BOTH naming conventions, like every other Upstash consumer. This module
  // used to read only UPSTASH_* - so a project provisioned with just KV_REST_API_*
  // silently landed in bundled-only mode AND made kvConfigured() false, which skipped
  // the cron's `kvExpected && !persisted` guard and returned ok:true, persisted:false.
  // That is exactly the "healthchecks blind to silent KV write failures" case the
  // kvConfigured() comment below says it exists to prevent.
  const url = redisUrl();
  const token = redisToken();
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// True when both Upstash env vars are present (a write is EXPECTED to land
// in KV). False when either is missing (bundled-snapshot-only mode). Lets
// the cron handler distinguish "wrote successfully" from "skipped write
// because no KV configured" - both currently look identical (persisted=false)
// without this signal. Pre-fix the cron always returned ok:true which made
// healthchecks blind to silent KV write failures.
export function kvConfigured(): boolean {
  return redisConfigured();
}

export function snapshotVersion(servers: RegistryEntry[]): string {
  // Stable identity: sha256 of (name@version) tuples sorted.
  const tuples = servers
    .map((e) => `${e.server.name}@${e.server.version}`)
    .sort();
  return createHash('sha256').update(tuples.join('\n')).digest('hex').slice(0, 16);
}

export async function readKVSnapshot(): Promise<StoredSnapshot | null> {
  const redis = clientOrNull();
  if (!redis) return null;
  try {
    const raw = await redis.get<StoredSnapshot>(KV_KEY);
    if (!raw) return null;
    return raw;
  } catch (err) {
    console.error('snapshotStore: KV read failed, falling back', err);
    return null;
  }
}

export async function writeKVSnapshot(snap: StoredSnapshot): Promise<boolean> {
  const redis = clientOrNull();
  if (!redis) return false;
  try {
    // ALWAYS with an expiry - see KV_TTL_SECONDS. A `set` without one is what let a
    // single manual invocation override the committed snapshot indefinitely.
    await redis.set(KV_KEY, snap, { ex: KV_TTL_SECONDS });
    return true;
  } catch (err) {
    console.error('snapshotStore: KV write failed', err);
    return false;
  }
}
