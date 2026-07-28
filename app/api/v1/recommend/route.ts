import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { rankServers, recommendationProvenance, toRecommendations } from '@/lib/recommend';

export const revalidate = 300;

// Matches preflight's cap (256): a long arbitrary task becomes part of the s-maxage
// cache key, so bound it to defend edge-cache-slot exhaustion. The ranker discards
// most of a long task anyway (tokenize drops stopwords).
const MAX_TASK_LEN = 256;

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
  if (task.length > MAX_TASK_LEN) {
    return Response.json({ error: 'task too long' }, { status: 400 });
  }

  const servers = await loadServers();
  const ranked = rankServers(servers, task, 3);

  return Response.json(
    {
      task,
      recommendations: toRecommendations(ranked),
      // The retired note claimed "keyword match (70%) with MCP Quality Score (30%)". That
      // stopped being true on 2026-06-01, when the composite changed to `score + QS*0.1`
      // because a 0.3*QS term swamped the search score and floated generic high-QS servers
      // to rank-1. The weighting moved; the sentence describing it to every API consumer
      // did not. It now comes from `provenance.basis`, which lives beside the composite.
      provenance: recommendationProvenance(),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Source': 'mcpindex.ai',
      },
    },
  );
}
