import type { NextRequest } from 'next/server';
import { ledgerEnabled } from '@/lib/ledger';
import { loadLedger } from '@/lib/ledgerServer';
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
  // no-store, NOT max-age: this endpoint is flag-gated and force-dynamic. A browser-cached 200
  // would keep serving the gated ledger for up to its TTL after an M4 rollback (flag flipped off),
  // so the kill switch would not be a clean kill. Per-request is fine -- a single Upstash GET.
  return Response.json(ledger, {
    headers: { 'cache-control': 'no-store' },
  });
}
