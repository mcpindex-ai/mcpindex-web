import 'server-only';
import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';
import type { RegistryEntry, Snapshot } from './types';

// Upstash KV write-through for snapshots. Cron writes after a successful
// fetch; read path tries KV first and falls back to bundled snapshot.json.
// Upstash quota is the new SPOF; the bundled-snapshot fallback mitigates it.

const KV_KEY = 'mcpindex:snapshot:v1';

export type StoredSnapshot = Snapshot & {
  snapshot_version: string;
  snapshot_written_at: string;
};

function clientOrNull(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
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
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
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
    await redis.set(KV_KEY, snap);
    return true;
  } catch (err) {
    console.error('snapshotStore: KV write failed', err);
    return false;
  }
}
