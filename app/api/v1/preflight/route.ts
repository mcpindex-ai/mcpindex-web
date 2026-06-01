// INTERNAL, UNCOMMITTED BFF - powers the homepage "find the tool, then check
// the verdict" demo in ONE round trip. Composes the same composite ranker as
// /api/v1/recommend with the seeded verdict store, so the demo can show the
// rank-1 server AND its trust verdict together.
//
// NOT a public contract: undocumented, unversioned, no stability promise, and
// marked noindex. The public, stable surface agents should build against is
// /api/v1/trust/server/[server_id]. If we ever promote this to a documented
// "pre-flight" wedge API, that promotion is the one-way door (decisions.md).
//
// Why this returns the FULL verdict (incl. rationale) while the public trust
// endpoint strips it: rationale is already shown publicly on /server/[slug],
// and feeding the keystone VerdictCard requires the full Verdict shape.

import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { rankServers, toRecommendations } from '@/lib/recommend';
import { getVerdict } from '@/lib/verdicts';

export const revalidate = 300;

// Matches the public trust route's cap: a long arbitrary task becomes part of
// the s-maxage cache key, so bound it to defend edge-cache-slot exhaustion.
const MAX_TASK_LEN = 512;

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
  const recommendations = toRecommendations(ranked);

  // The verdict is for rank-1 - the server the agent would actually reach for.
  // null when that server has not been screened yet (the honest, common case
  // today: ~158 of ~10k screened). The client renders that as "not screened".
  const top = recommendations[0];
  const full = top ? await getVerdict(top.slug) : null;
  // Drop per-dimension evidence quotes: the demo's VerdictCard never renders
  // them, so don't forward a field the public trust endpoint strips.
  const verdict = full
    ? { ...full, dimensions: full.dimensions.map(({ evidence: _evidence, ...d }) => d) }
    : null;

  return Response.json(
    {
      task,
      recommendations,
      screened_for: top?.slug ?? null,
      verdict, // full Verdict | null (UPPERCASE enums, feeds VerdictCard directly)
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Robots-Tag': 'noindex',
        'X-Source': 'mcpindex.ai/internal',
      },
    },
  );
}
