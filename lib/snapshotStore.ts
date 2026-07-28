import 'server-only';
import { createHash } from 'node:crypto';
import type { RegistryEntry, Snapshot } from './types';

// Snapshot identity. That is ALL this module does now.
//
// It used to be an Upstash KV write-through cache for the registry snapshot: the cron wrote,
// and the page render path read KV first with the bundled data/snapshot.json as fallback.
// The read side was removed because @upstash/redis defaults its fetch to `cache: "no-store"`
// and this module never overrode it, which made every ISR route bail to dynamic at runtime
// and 500 on cold instances.
//
// That left the write side orphaned: a ~26MB blob published every invocation to a key with no
// reader, on a metered plan, with no test covering the success path. The whole KV path is now
// gone rather than left as a write-only limb. Nothing about it was load-bearing - within a
// deployment data/snapshot.json is immutable, and the canonical refresh
// (.github/workflows/sync-registry.yml) commits that file every 4h AND redeploys.
//
// Deliberate side effect worth keeping: this module no longer imports @upstash/redis at all,
// so lib/registry.ts - which imports snapshotVersion from here - has no Redis in its module
// graph. Do not reintroduce one; put any future Redis consumer in its own module.

export type StoredSnapshot = Snapshot & {
  snapshot_version: string;
  snapshot_written_at: string;
};

export function snapshotVersion(servers: RegistryEntry[]): string {
  // Stable identity: sha256 of (name@version) tuples sorted.
  const tuples = servers
    .map((e) => `${e.server.name}@${e.server.version}`)
    .sort();
  return createHash('sha256').update(tuples.join('\n')).digest('hex').slice(0, 16);
}
