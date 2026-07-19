import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { fetchAllPages } from '@/lib/registry';
import { kvConfigured, snapshotVersion, writeKVSnapshot } from '@/lib/snapshotStore';

// NO LONGER SCHEDULED. The Vercel cron was removed (2026-07-19): a full registry
// fetch (~542 sequential pages, 25-50min) can't finish within maxDuration=300s, so
// the cron never wrote KV. The canonical sync is the GitHub Actions workflow
// (.github/workflows/sync-registry.yml), which commits data/snapshot.json to main;
// readers fall back to that bundled snapshot on KV miss. This route is kept (auth-gated,
// CRON_SECRET) for manual/on-demand invocation; a successful fetch still writes KV.
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
    const all = await fetchAllPages(500);
    const latest = all.filter(
      (e) => e._meta?.['io.modelcontextprotocol.registry/official']?.isLatest,
    );
    const writtenAt = new Date().toISOString();
    const version = snapshotVersion(latest);
    const persisted = await writeKVSnapshot({
      fetchedAt: writtenAt,
      totalEntries: all.length,
      servers: latest,
      snapshot_version: version,
      snapshot_written_at: writtenAt,
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
          totalEntries: all.length,
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
      totalEntries: all.length,
      latestServers: latest.length,
      elapsedMs: elapsed,
      persisted,
      kv_configured: kvExpected,
      snapshot_version: version,
      snapshot_written_at: writtenAt,
    });
  } catch (err) {
    // Log full error server-side; return generic body to avoid leaking
    // upstream registry hostnames / DNS errors / TLS strings to callers.
    console.error('cron/sync-registry: fetch failed', err);
    return Response.json(
      { ok: false, error: 'registry_fetch_failed' },
      { status: 500 },
    );
  }
}
