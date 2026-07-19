import { NextRequest } from 'next/server';

/**
 * Privacy-safe adoption beacon - event name + short source tag only.
 * Visible in Vercel logs as `[beacon]`. Complements Vercel Analytics `track`.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    event?: string;
    source?: string;
  };
  const ALLOWED = new Set(['gate_install_copy', 'gate_cta_click']);
  if (!body.event || !ALLOWED.has(body.event)) {
    return Response.json({ error: 'unsupported_event' }, { status: 400 });
  }
  const source = String(body.source ?? 'unknown')
    .replace(/[^\w.-]/g, '')
    .slice(0, 64);
  console.log(`[beacon] ${new Date().toISOString()} ${body.event} source=${source || 'unknown'}`);
  return Response.json({ ok: true });
}
