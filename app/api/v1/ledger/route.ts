import type { NextRequest } from 'next/server';
import { ledgerEnabled } from '@/lib/ledger';
import { loadLedgerIndex, loadLedgerPage } from '@/lib/ledgerServer';
import {
  LEDGER_SCHEMA_V4,
  decodeCursor,
  encodeCursor,
  isLedgerSection,
  type LedgerCursor,
  type LedgerSection,
} from '@/lib/ledgerV4';
import { checkDriftReadLimit, checkLedgerReadLimit } from '@/lib/ratelimit';

// Public drift ledger, schema /4: the contract changes mcpindex's CRAWLER OBSERVED between daily
// registry snapshots - a contract diff, not a safety verdict, not an in-path prevention. Read-only
// and paged: one section (events | context_events | fleet_events) per request, up to 1,000 rows
// a page, with an opaque cursor to the next page. /3 served the whole blob and is retired.
//
// Gated by NEXT_PUBLIC_DRIFT_LEDGER: when off, this 404s exactly like a non-existent route.
// Rate-limited like the rest of the drift read path, plus its own per-IP bulk budget.
//
// Reads only the v4 index and pages; the split summary is not involved. Never falls back to the
// retired `drift:ledger` blob: a missing, stale or malformed index is 503 with no rows.
export const dynamic = 'force-dynamic';

// no-store, NOT max-age: this endpoint is flag-gated and force-dynamic. A browser-cached 200 would
// keep serving the gated ledger after an M4 rollback (flag flipped off), so the kill switch would
// not be a clean kill.
const NO_STORE = { 'cache-control': 'no-store' };

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function unavailable(): Response {
  return Response.json({ error: 'unavailable' }, { status: 503, headers: { ...NO_STORE, 'retry-after': '120' } });
}

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  if (!ledgerEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const ip = clientIp(req);
  const now = new Date();
  // Bulk budget first, so a client paging hard is refused WITHOUT burning the shared drift-read
  // allowance that /api/v1/drift/any (the SDK gate check) runs on.
  const bulk = await checkLedgerReadLimit(ip, now);
  if (!bulk.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }
  const limit = await checkDriftReadLimit(ip, now);
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }

  // Parameters are checked before any ledger read, so a malformed request costs no Upstash GET.
  const params = req.nextUrl.searchParams;
  const sectionParam = params.get('section');
  if (sectionParam !== null && !isLedgerSection(sectionParam)) return badRequest('invalid_section');
  const cursorParam = params.get('cursor');
  let cursor: LedgerCursor | null = null;
  if (cursorParam !== null) {
    cursor = decodeCursor(cursorParam);
    if (!cursor) return badRequest('invalid_cursor');
    if (sectionParam !== null && sectionParam !== cursor.section) return badRequest('section_cursor_mismatch');
  }
  const section: LedgerSection = cursor?.section ?? (sectionParam as LedgerSection | null) ?? 'events';

  const index = await loadLedgerIndex();
  if (!index) return unavailable();

  let gen = index.gen;
  let n = 0;
  let pages = index.pages[section];
  if (cursor && cursor.gen === index.gen) {
    // A cursor into the live generation is bounded by the index, not by what the cursor claims.
    if (cursor.n >= pages) return badRequest('invalid_cursor');
    n = cursor.n;
  } else if (cursor) {
    // A superseded generation: its index is gone, so the cursor carries where it ends. Its pages
    // live 7,200s past the next publish; after that the key is missing and the answer is 410.
    gen = cursor.gen;
    n = cursor.n;
    pages = cursor.pages;
  }

  let items: readonly unknown[] = [];
  if (pages > 0) {
    const page = await loadLedgerPage(gen, section, n);
    if (page.status === 'missing') {
      if (gen === index.gen) return unavailable(); // the index names a page that is not there
      return Response.json(
        { error: 'cursor_expired', restart: `/api/v1/ledger?section=${section}` },
        { status: 410, headers: NO_STORE },
      );
    }
    if (page.status === 'error') return unavailable();
    items = page.items;
  }

  return Response.json(
    {
      schema: LEDGER_SCHEMA_V4,
      // items, page, pages and next_cursor belong to the generation in generated_at; stat and
      // counts describe the latest published one (the same, unless this is an older cursor).
      generated_at: gen === index.gen ? index.generated_at : genToIso(gen),
      framing: index.framing,
      stat: index.stat,
      counts: index.counts,
      section,
      page: n,
      pages,
      items,
      next_cursor: n + 1 < pages ? encodeCursor({ gen, section, n: n + 1, pages }) : null,
    },
    { headers: NO_STORE },
  );
}

/** 20261014T160153Z-1a2b3c4d -> 2026-10-14T16:01:53Z. `gen` already matched GEN_RE. */
function genToIso(gen: string): string {
  return `${gen.slice(0, 4)}-${gen.slice(4, 6)}-${gen.slice(6, 8)}T${gen.slice(9, 11)}:${gen.slice(11, 13)}:${gen.slice(13, 15)}Z`;
}
