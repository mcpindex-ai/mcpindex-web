import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { rankServers, toRecommendations } from '@/lib/recommend';

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
  const ranked = rankServers(servers, task, 3);

  return Response.json(
    {
      task,
      recommendations: toRecommendations(ranked),
      note:
        'v0 ranker - heuristic score blends keyword match (70%) with MCP Quality Score (30%). ' +
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
