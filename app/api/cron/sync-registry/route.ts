import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { fetchAllPages } from '@/lib/registry';

// Vercel cron hits this once per day (see vercel.json).
// Mounts a fresh snapshot in-memory for downstream readers. Persisting to
// disk in serverless requires either a write-through KV (Upstash) or a
// commit-via-GitHub-Action — Day-0 setup will pick one.
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
    const elapsed = Date.now() - start;
    return Response.json({
      ok: true,
      totalEntries: all.length,
      latestServers: latest.length,
      elapsedMs: elapsed,
      note:
        'In serverless this run validates connectivity. Persistent snapshot updates require either a KV write or a GitHub Actions commit — see READY_TO_LAUNCH.md for setup.',
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
