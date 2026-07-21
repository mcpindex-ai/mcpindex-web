import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { readBundledSnapshot } from '@/lib/registry';
import { kvConfigured, snapshotVersion, writeKVSnapshot } from '@/lib/snapshotStore';

// NOT SCHEDULED, AND NO LONGER FETCHES UPSTREAM. This is a manual "republish the cache"
// lever, not a sync.
//
// The canonical refresh is .github/workflows/sync-registry.yml: it pulls ~542 sequential
// pages every 4h and commits data/snapshot.json to main, and readers fall back to that
// bundled file on a KV miss. This route used to attempt the SAME upstream fetch, which
// cannot finish inside maxDuration=300s (measured 34s on a good window, ~135min on a bad
// one), so it almost always died partway - an endpoint that could start but not complete.
//
// Worse, on the rare success it wrote KV with NO expiry, and the read path prefers KV
// unconditionally: one manual invocation could pin the live site to that blob forever while
// the workflow kept committing fresh snapshots that nothing read. (writeKVSnapshot now sets
// a 6h TTL, which bounds that; this change removes the trap at the source.)
//
// So it now republishes the ALREADY-COMMITTED snapshot into KV. That completes in
// milliseconds, always finishes, and is the only thing a manual button here can usefully do:
// force the cache to match the repo. To pull NEW servers from upstream, run the workflow
// (`gh workflow run sync-registry.yml`) - that is the job that owns the slow fetch.
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
    const writtenAt = new Date().toISOString();
    const version = bundled.snapshot_version || snapshotVersion(latest);
    const persisted = await writeKVSnapshot({
      fetchedAt: bundled.fetchedAt, // preserve WHEN the data was actually fetched upstream...
      totalEntries: bundled.totalEntries,
      servers: latest,
      snapshot_version: version,
      snapshot_written_at: writtenAt, // ...and record separately when this copy was published
    });
    const elapsed = Date.now() - start;
    // KV write was EXPECTED if both Upstash env vars are present. If it
    // was expected and failed, return 503 with ok:false so upstream
    // healthchecks (keyed on status code or `ok`) actually fire. Without
    // this branch the cron silently returned ok:true even when KV write
    // failed, making healthcheck-driven alerting blind to silent storage
    // outages. When KV is NOT configured (bundled-snapshot mode), persisted
    // being false is by design and ok:true is correct.
    const kvExpected = kvConfigured();
    if (kvExpected && !persisted) {
      return Response.json(
        {
          ok: false,
          error: 'kv_write_failed',
          totalEntries: bundled.totalEntries,
          latestServers: latest.length,
          elapsedMs: elapsed,
          persisted: false,
          snapshot_version: version,
          snapshot_written_at: writtenAt,
        },
        { status: 503 },
      );
    }
    return Response.json({
      ok: true,
      totalEntries: bundled.totalEntries,
      latestServers: latest.length,
      elapsedMs: elapsed,
      persisted,
      kv_configured: kvExpected,
      source: 'bundled-snapshot', // never upstream; see the header comment
      snapshot_version: version,
      snapshot_written_at: writtenAt,
    });
  } catch (err) {
    // Log full error server-side; return generic body to avoid leaking
    // upstream registry hostnames / DNS errors / TLS strings to callers.
    console.error('cron/sync-registry: republish failed', err);
    return Response.json(
      { ok: false, error: 'snapshot_republish_failed' },
      { status: 500 },
    );
  }
}
