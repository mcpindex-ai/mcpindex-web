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
