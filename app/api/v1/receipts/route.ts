import type { NextRequest } from 'next/server';
import { ReceiptBatchSchema, recordReceiptBatch } from '@/lib/receiptIngest';
import { resolveIngestAuthedInstalls } from '@/lib/driftIdentity';
import { checkReceiptLimit } from '@/lib/ratelimit';

// Action-receipt ingest (Phase D). POST only. Accepts a batch of CLOSED ActionReceipts from the
// opt-in SDK emitter (tooling.cse.receipt_emit), validates the shape STRICTLY (the server-side
// privacy backstop — no free-text key may pass), enqueues each validated receipt to the corpus
// stream + folds the distinct-install HLL, and returns 204. STORE-ONLY: no aggregated/multi-party
// signal is computed or served here, and there is no read route (publishing a fleet signal is a
// gated one-way door handled elsewhere). Fail-CLOSED on shape (a malformed body is 400 — we never
// persist a receipt we could not validate); fail-OPEN on our own Redis.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Require application/json — closes the no-preflight ("simple") cross-origin text/plain
  // path, same as /api/v1/drift. Direct SDK callers send JSON and are unaffected.
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
  const limit = await checkReceiptLimit(ip, new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = ReceiptBatchSchema.safeParse(raw);
  if (!parsed.success) {
    // Fail-closed: reject the whole batch on ANY shape violation. No detail echoed back
    // (a strict 400 — never reflect attacker input, never log/echo a receipt value or install_id).
    return Response.json({ error: 'invalid_receipt' }, { status: 400 });
  }

  const { install_id, receipts } = parsed.data;
  const authedInstalls = await resolveIngestAuthedInstalls(
    [install_id],
    req.headers.get('authorization'),
  );

  await recordReceiptBatch(receipts, install_id, new Date(), authedInstalls);
  return new Response(null, { status: 204 });
}
