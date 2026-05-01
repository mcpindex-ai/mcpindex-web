import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { search } from '@/lib/search';
import { computeQuality } from '@/lib/quality';

export const revalidate = 300;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const category = req.nextUrl.searchParams.get('category')?.trim();
  const limit = Math.min(50, parseInt(req.nextUrl.searchParams.get('limit') ?? '10', 10));

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
        slug: h.server.slug,
        name: h.server.name,
        title: h.server.title,
        description: h.server.description,
        category: h.server.category,
        version: h.server.version,
        qualityScore: computeQuality(h.server).score,
        installs: {
          npm: h.server.npmPackage,
          pypi: h.server.pypiPackage,
          docker: h.server.dockerImage,
          remote: h.server.remoteUrl,
        },
        url: `https://mcpindex.ai/server/${h.server.slug}`,
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
