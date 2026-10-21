import type { NextRequest } from 'next/server';
import { ledgerEnabled } from '@/lib/ledger';
import { loadServerDrift } from '@/lib/serverDriftServer';
import { checkServerDriftLimit } from '@/lib/ratelimit';

// Server-level contract drift for ONE named server, computed at RUNTIME (the Vercel build cannot
// reach Upstash; runtime can). Server pages outside the search set fetch it from their client-side
// drift section; pages offered to search render it server-side and do not call this. Read-only.
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function secondsToUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export async function GET(req: NextRequest) {
  if (!ledgerEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  // Validate before the limiter so a malformed request spends no budget and no Redis call.
  const server = (new URL(req.url).searchParams.get('server') ?? '').trim();
  if (!server || server.length > 256) {
    return Response.json({ error: 'invalid_server' }, { status: 400 });
  }
  // Own budget, fail-closed (lib/ratelimit.ts): open by name, never open in bulk.
  const limit = await checkServerDriftLimit(clientIp(req), new Date());
  if (!limit.ok) {
    if (limit.reason === 'unavailable') {
      return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'retry-after': '120' } });
    }
    // The daily ceiling holds until the UTC day rolls over, so say when that is.
    const retry = limit.reason === 'global' ? secondsToUtcMidnight(new Date()) : 60;
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': String(retry) } });
  }
  const drift = await loadServerDrift(server);
  if (!drift) {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'retry-after': '120' } });
  }
  return Response.json(drift, { headers: { 'cache-control': 'no-store' } });
}
