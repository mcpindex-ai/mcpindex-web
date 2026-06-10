import type { NextRequest } from 'next/server';
import { ledgerEnabled } from '@/lib/ledger';
import { loadServerDrift } from '@/lib/serverDriftServer';
import { checkDriftReadLimit } from '@/lib/ratelimit';

// Server-level contract drift for ONE named server, computed at RUNTIME (the Vercel build cannot
// reach Upstash; runtime can). The server page's drift section is a client component that calls this
// so it is always current and never depends on build-time data. Read-only, fail-soft.
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function GET(req: NextRequest) {
  if (!ledgerEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const limit = await checkDriftReadLimit(clientIp(req), new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }
  const server = (new URL(req.url).searchParams.get('server') ?? '').trim();
  if (!server || server.length > 256) {
    return Response.json({ error: 'invalid_server' }, { status: 400 });
  }
  const drift = await loadServerDrift(server);
  if (!drift) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'retry-after': '120' } });
  }
  return Response.json(drift, { headers: { 'cache-control': 'no-store' } });
}
