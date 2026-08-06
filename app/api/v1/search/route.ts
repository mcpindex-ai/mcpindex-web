import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { search } from '@/lib/search';
import { toListItem } from '@/lib/projection';
import { livenessLookup } from '@/lib/sourceLiveness';

export const revalidate = 300;

// Matches preflight/recommend (256): q becomes part of the s-maxage cache key, so
// bound it to defend edge-cache-slot exhaustion. Real queries are short.
const MAX_Q_LEN = 256;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const category = req.nextUrl.searchParams.get('category')?.trim();

  // Exact slug resolution (?slug=<exact>): returns the single matching server, or an empty result
  // set. Free-text search over a hyphenated slug does NOT reliably surface its own server, so the
  // claim wizard's deep-link (/claim?server=<slug>) needs a deterministic lookup. Additive: same
  // { query, total, results } shape as the search path.
  const slug = req.nextUrl.searchParams.get('slug')?.trim();
  if (slug) {
    if (slug.length > MAX_Q_LEN) {
      return Response.json(
        { error: 'slug too long' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const [servers, livenessOf] = await Promise.all([loadServers(), livenessLookup()]);
    const found = servers.find((s) => s.slug === slug);
    return Response.json(
      {
        query: slug,
        total: found ? 1 : 0,
        results: found ? [toListItem(found, livenessOf(found))] : [],
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
          'X-Source': 'mcpindex.ai',
        },
      },
    );
  }
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
  // Both q AND category are part of the raw query string → the s-maxage cache key.
  // Capping only q leaves category as an unbounded cache-key-variety vector, so bound both.
  if (q.length > MAX_Q_LEN || (category && category.length > MAX_Q_LEN)) {
    return Response.json(
      { error: 'query too long' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const [servers, livenessOf] = await Promise.all([loadServers(), livenessLookup()]);
  const hits = search(servers, q, { limit, categoryFilter: category ?? undefined });

  return Response.json(
    {
      query: q,
      total: hits.length,
      results: hits.map((h) => ({
        ...toListItem(h.server, livenessOf(h.server)),
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
