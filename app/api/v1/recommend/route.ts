import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { search } from '@/lib/search';
import { computeQuality } from '@/lib/quality';

export const revalidate = 300;

// /api/v1/recommend?task=<natural language>
// Returns top 3 servers with one-line reasoning each.
// Without OPENAI_API_KEY: heuristic ranking by search score + quality.
// With OPENAI_API_KEY: re-rank top 10 with a single GPT call (deferred).

export async function GET(req: NextRequest) {
  const task = req.nextUrl.searchParams.get('task')?.trim() ?? '';
  if (!task) {
    return Response.json(
      { error: 'Missing required ?task=<natural language description>' },
      { status: 400 },
    );
  }

  const servers = await loadServers();
  const hits = search(servers, task, { limit: 10 });

  // Composite rank: 70% search score + 30% quality.
  const ranked = hits
    .map((h) => {
      const q = computeQuality(h.server).score;
      const composite = h.score * 0.7 + q * 0.3;
      return { hit: h, composite, quality: q };
    })
    .sort((a, b) => b.composite - a.composite)
    .slice(0, 3);

  return Response.json(
    {
      task,
      recommendations: ranked.map(({ hit, quality }, i) => ({
        rank: i + 1,
        slug: hit.server.slug,
        name: hit.server.name,
        title: hit.server.title,
        description: hit.server.description,
        category: hit.server.category,
        qualityScore: quality,
        reasoning: buildReasoning(hit, task),
        installs: {
          npm: hit.server.npmPackage,
          pypi: hit.server.pypiPackage,
          docker: hit.server.dockerImage,
          remote: hit.server.remoteUrl,
        },
        url: `https://mcpindex.ai/server/${hit.server.slug}`,
      })),
      note:
        'v0 ranker — heuristic score blends keyword match (70%) with MCP Quality Score (30%). ' +
        'See /methodology for scoring details.',
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Source': 'mcpindex.ai',
      },
    },
  );
}

function buildReasoning(
  hit: { server: { title: string; category: string; description: string }; matchedTerms: string[] },
  _task: string,
): string {
  const matched = hit.matchedTerms.length;
  const cat = hit.server.category;
  if (matched >= 2) {
    return `Matches ${hit.matchedTerms.join(', ')} in title/description; category: ${cat}.`;
  }
  if (matched === 1) {
    return `Matches "${hit.matchedTerms[0]}" in ${cat}-category server.`;
  }
  return `Closest fit in ${cat} category by description overlap.`;
}
