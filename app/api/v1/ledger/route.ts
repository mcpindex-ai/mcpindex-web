import type { NextRequest } from 'next/server';
import { loadLedger, ledgerEnabled } from '@/lib/ledger';
import { checkDriftReadLimit } from '@/lib/ratelimit';

// Public drift ledger (M4): the contract changes mcpindex's CRAWLER OBSERVED between daily
// registry snapshots — a contract diff, not a safety verdict, not an in-path prevention. Read-only.
// Gated by NEXT_PUBLIC_DRIFT_LEDGER: when off, this 404s exactly like a non-existent route, so the
// surface is invisible until M4 go-live. Rate-limited like the rest of the drift read path.
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
  const ledger = await loadLedger();
  if (!ledger) {
    // Flag on but blob unavailable/malformed: honest "not published right now", never a stale lie.
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'retry-after': '120' } });
  }
  return Response.json(ledger, {
    headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
