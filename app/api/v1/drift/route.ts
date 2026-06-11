import type { NextRequest } from 'next/server';
import { DriftBatchSchema, recordDriftBatch } from '@/lib/driftIngest';
import { authedInstallSet } from '@/lib/driftIdentity';
import { checkDriftLimit } from '@/lib/ratelimit';

// Drift-telemetry ingest (M1). POST only. Accepts a batch of CLOSED DriftSignals from the
// opt-in SDK emitters, validates the shape STRICTLY (the server-side privacy backstop), folds
// it into best-effort counters, and returns 204. Fail-CLOSED on shape (a malformed body is
// 400 — we never persist a signal we could not validate); fail-OPEN on our own Redis.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Require application/json — closes the no-preflight ("simple") cross-origin text/plain
  // path, same as /api/v1/screen. Direct SDK callers send JSON and are unaffected.
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return Response.json({ error: 'unsupported_media_type' }, { status: 415 });
  }

  // Vercel sets x-vercel-forwarded-for at the edge (client cannot forge it); raw
  // x-forwarded-for is the off-Vercel fallback only.
  const ip =
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const limit = await checkDriftLimit(ip, new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = DriftBatchSchema.safeParse(raw);
  if (!parsed.success) {
    // Fail-closed: reject the whole batch on ANY shape violation. No detail echoed back
    // (a strict 400 — never reflect attacker input).
    return Response.json({ error: 'invalid_signal' }, { status: 400 });
  }

  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  const token = bearer?.[1]?.trim();
  const installIds = [...new Set(parsed.data.signals.map((s) => s.install_id))];
  const authedInstalls = token ? await authedInstallSet(installIds, token) : new Set<string>();

  await recordDriftBatch(parsed.data.signals, new Date(), authedInstalls);
  return new Response(null, { status: 204 });
}
