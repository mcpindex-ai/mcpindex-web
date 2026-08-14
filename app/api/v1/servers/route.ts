import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { toListItem } from '@/lib/projection';
import { livenessLookup } from '@/lib/sourceLiveness';

export const revalidate = 3600;

// Public browse feed: the top MCP servers by quality score. Built for
// registry-of-registries consumers (e.g. Mastra's mcp-registry-registry) that
// pull a single fixed URL with a bare GET. Bounded on purpose — a quality-ranked
// sampler, not a 50k dump. `total` is the active-corpus size so a caller can see
// this is a page, not the whole registry.
//
// `totalBySource` EXISTS TO RECONCILE TWO PUBLISHED NUMBERS. `total` counts the whole
// active corpus (registry + editorially admitted); /api/registry-count deliberately counts
// registry rows ONLY, because it publishes its figure next to the explicit claim
// `source: registry.modelcontextprotocol.io` (see `registry.getServerCount`). Both are
// correct and they differ by the admitted set — but the difference was only discoverable by
// reading our source, so the two endpoints read as an unexplained disagreement (21,311 vs
// 21,304) to anyone checking. For a product whose whole pitch is checkable numbers, that is
// the defect: not the gap, but a `total` that never said what it totalled. The breakdown is
// ADDITIVE — `total` keeps its meaning and value, so no existing consumer moves.
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get('category')?.trim() || undefined;
  // Garbage/NaN limit falls back to the default; never dumps the corpus, never 500s.
  const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(250, Math.max(1, rawLimit)) : 100;

  const [all, livenessOf] = await Promise.all([loadServers(), livenessLookup()]);
  const pool = category ? all.filter((s) => s.category === category) : all;
  const servers = pool
    .map((s) => toListItem(s, livenessOf(s)))
    // Quality desc; slug asc as a deterministic tie-break so the page is stable.
    .sort((a, b) => b.qualityScore - a.qualityScore || a.slug.localeCompare(b.slug))
    .slice(0, limit);

  return Response.json(
    {
      total: pool.length,
      // Counted off the SAME `pool` as `total`, so the parts can never fail to sum to the
      // whole — deriving `registry` here but reading `admitted` from anywhere else would
      // reintroduce exactly the two-sources-of-truth bug this field exists to close. Honours
      // `?category=` for the same reason.
      totalBySource: {
        registry: pool.filter((s) => s.source === 'registry').length,
        admitted: pool.filter((s) => s.source === 'admitted').length,
      },
      returned: servers.length,
      // Snapshot/cache-fill time (bounded by revalidate=3600), not per-request time — it signals
      // how fresh this page is, which is the freshness a browse consumer actually wants.
      generatedAt: new Date().toISOString(),
      servers,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'X-Source': 'mcpindex.ai',
      },
    },
  );
}
