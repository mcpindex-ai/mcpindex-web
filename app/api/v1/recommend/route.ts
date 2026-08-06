import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { livenessLookup } from '@/lib/sourceLiveness';
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

  const [servers, livenessOf] = await Promise.all([loadServers(), livenessLookup()]);
  const ranked = rankServers(servers, task, livenessOf, 3);
  const prov = recommendationProvenance();

  return Response.json(
    {
      task,
      recommendations: toRecommendations(ranked),
      provenance: prov,
      // DEPRECATED alias of `provenance.basis`, kept because REMOVING it was a breaking
      // change to a versioned public API. /docs promises "breaking changes ship behind
      // /api/v2; v1 stays available for at least 6 months" - and mcp-server-mcpindex,
      // our own published npm package, reads `data.note` and printed a bare "Source:"
      // line for every installed copy the moment this field vanished. A server-side
      // removal cannot be fixed by a client release, so v1 keeps the key.
      //
      // Its VALUE is now derived, not written twice. The old literal claimed the ranker
      // "blends keyword match (70%) with MCP Quality Score (30%)", which stopped being
      // true on 2026-06-01 when the composite became `score + QS*0.1`; the weighting
      // moved and the sentence describing it to every consumer did not. Deriving it is
      // what stops that recurring.
      note: prov.basis,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Source': 'mcpindex.ai',
      },
    },
  );
}
