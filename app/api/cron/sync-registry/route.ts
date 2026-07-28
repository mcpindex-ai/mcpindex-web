import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { readBundledSnapshot } from '@/lib/registry';
import { snapshotVersion } from '@/lib/snapshotStore';

// READ-ONLY STATUS. THIS ENDPOINT CANNOT CHANGE WHAT THE SITE SERVES.
//
// It reports which registry snapshot THIS deployment is serving. That is the whole contract.
// Reaching for it during a "the site looks stale" incident will tell you what is deployed; it
// will not make anything fresher.
//
// History, because the name still says "sync": it once fetched ~180 upstream pages (couldn't
// finish inside maxDuration), then was reduced to republishing the committed snapshot into
// Upstash KV. The KV read path was removed when it turned out to be forcing every ISR route
// dynamic, which left this route writing a ~26MB blob nothing read - so the write went too.
//
// THE REAL LEVER for new upstream servers is the workflow that owns the slow fetch:
//   gh workflow run sync-registry.yml
// It commits data/snapshot.json to main every 4h and Vercel redeploys on push. Because the
// snapshot is a build artifact, a deploy is the ONLY thing that changes what is served.
//
// Two traps removed with the KV write, both worth not reintroducing:
//   - it returned `snapshot_written_at: new Date()`, which fed loadSnapshotMeta().writtenAt -
//     the exact field tools/healthcheck/mcpindex_snapshot_freshness.py grades. One manual hit
//     reset the staleness clock with no new data. It now reports the snapshot's OWN timestamp.
//   - a `kvExpected && !persisted` guard returned 503 on a failed write to that unread key,
//     i.e. it could page while the site was perfectly healthy.
export const runtime = 'nodejs';
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  if (!header) return false;
  // Explicit utf8 encoding; fetch-spec joins multi-value Authorization headers
  // with ", " which makes the joined length differ from `Bearer ${secret}`,
  // so the length pre-check below rejects before timingSafeEqual can throw.
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const got = Buffer.from(header, 'utf8');
  if (got.length !== expected.length) return false;
  return timingSafeEqual(got, expected);
}

export async function GET(req: NextRequest) {
  // Single 401 response for both unset-secret and wrong-secret avoids
  // leaking deploy state to unauth scanners. Misconfig is logged server-side.
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorized(req.headers.get('authorization'), secret)) {
    if (!secret) console.error('cron/sync-registry: CRON_SECRET unset');
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const start = Date.now();
  try {
    const bundled = await readBundledSnapshot();
    const latest = bundled.servers;
    return Response.json({
      ok: true,
      // Reports only. Nothing here mutates state - see the header comment.
      readonly: true,
      totalEntries: bundled.totalEntries,
      latestServers: latest.length,
      elapsedMs: Date.now() - start,
      source: 'bundled-snapshot',
      snapshot_version: bundled.snapshot_version || snapshotVersion(latest),
      // The snapshot's OWN timestamps, never `now()`. Fabricating a fresh one here is what
      // previously masked staleness from the freshness probe.
      fetchedAt: bundled.fetchedAt,
      snapshot_written_at: bundled.snapshot_written_at,
    });
  } catch (err) {
    // Log full error server-side; return generic body to avoid leaking
    // upstream registry hostnames / DNS errors / TLS strings to callers.
    console.error('cron/sync-registry: snapshot read failed', err);
    return Response.json(
      { ok: false, error: 'snapshot_read_failed' },
      { status: 500 },
    );
  }
}
