import { NextRequest } from 'next/server';
import { fetchAllPages } from '@/lib/registry';

// Vercel cron hits this once per day (see vercel.json).
// Mounts a fresh snapshot in-memory for downstream readers. Persisting to
// disk in serverless requires either a write-through KV (Upstash) or a
// commit-via-GitHub-Action — Day-0 setup will pick one.
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
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
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
