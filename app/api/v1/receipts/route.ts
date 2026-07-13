import type { NextRequest } from 'next/server';
import { ReceiptBatchSchema, recordReceiptBatch, getInstallReceipts } from '@/lib/receiptIngest';
import { resolveIngestAuthedInstalls } from '@/lib/driftIdentity';
import { checkReceiptLimit } from '@/lib/ratelimit';

// Action-receipt ingest (Phase D). POST accepts a batch of CLOSED ActionReceipts from the
// opt-in SDK emitter (tooling.cse.receipt_emit), validates the shape STRICTLY (the server-side
// privacy backstop - no free-text key may pass), enqueues each validated receipt to the corpus
// stream + folds the distinct-install HLL, and returns 204. GET returns the per-install compact
// receipt index (knowing the 32-hex install_id is the credential). STORE-ONLY on write: no
// aggregated/multi-party signal is computed or served here. Fail-CLOSED on shape (a malformed
// body is 400 - we never persist a receipt we could not validate); fail-OPEN on our own Redis.
export const dynamic = 'force-dynamic';

const INSTALL_ID_RE = /^[0-9a-f]{32}$/;

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!INSTALL_ID_RE.test(id)) {
    return Response.json({ error: 'invalid_id' }, { status: 400 });
  }
  const receipts = await getInstallReceipts(id);
  return Response.json({ receipts, count: receipts.length });
}

export async function POST(req: NextRequest) {
  // Require application/json - closes the no-preflight ("simple") cross-origin text/plain
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
    // (a strict 400 - never reflect attacker input, never log/echo a receipt value or install_id).
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
