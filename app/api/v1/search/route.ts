import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { search } from '@/lib/search';
import { toListItem } from '@/lib/projection';

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const category = req.nextUrl.searchParams.get('category')?.trim();
  // Bound the limit to [1, 50]; garbage/NaN falls back to the default. A negative or NaN
  // limit must never reach search()'s slice() (slice(0,-1) would leak all-but-one, NaN -> []).
  const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 10;

  if (!q) {
    return Response.json(
      { error: 'Missing required ?q=<query>' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const servers = await loadServers();
  const hits = search(servers, q, { limit, categoryFilter: category ?? undefined });

  return Response.json(
    {
      query: q,
      total: hits.length,
      results: hits.map((h) => ({
        ...toListItem(h.server),
        score: h.score,
        matched: h.matchedTerms,
      })),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Source': 'mcpindex.ai',
      },
    },
  );
}
