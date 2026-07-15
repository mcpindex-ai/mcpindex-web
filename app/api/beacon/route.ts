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
  if (body.event !== 'gate_install_copy') {
    return Response.json({ error: 'unsupported_event' }, { status: 400 });
  }
  const source = String(body.source ?? 'unknown')
    .replace(/[^\w.-]/g, '')
    .slice(0, 64);
  console.log(`[beacon] ${new Date().toISOString()} gate_install_copy source=${source || 'unknown'}`);
  return Response.json({ ok: true });
}
