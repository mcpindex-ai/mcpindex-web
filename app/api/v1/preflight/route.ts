// PUBLIC v1-advisory "pre-flight" API. One round trip = the tool an agent would
// reach for AND its trust verdict, so an agent can ask "what should I use, and
// can I trust it?" before it acts. Composes the same composite ranker as
// /api/v1/recommend with the seeded verdict store.
//
// Contract (stable, v1-advisory): GET ?task=<natural language> ->
//   { task, recommendations[<=3], screened_for, verdict, honest_limits }
// - verdict is the rank-1 server's advisory verdict (decision REVIEW; never a
//   confident ALLOW from a semantic-only screen), or null when that server is
//   not yet screened (fail-closed: treat as not-cleared).
// - honest_limits states the posture on the wire: advisory, semantic-only, no
//   live conformance. The per-server primitive is /api/v1/trust/server/[slug].
// Promotion to a public contract logged in tasks/decisions.md (one-way door).
//
// Returns the FULL verdict (incl. rationale, already public on /server/[slug])
// minus per-dimension evidence quotes.

import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';
import { rankServers, toRecommendations } from '@/lib/recommend';
import { getScreenedVerdict } from '@/lib/verdicts';
import { ADVISORY_FLOOR } from '@/lib/honest-limits';

export const revalidate = 300;

// Matches the public trust route's cap (256): a long arbitrary task becomes part
// of the s-maxage cache key, so bound it to defend edge-cache-slot exhaustion.
// The ranker discards most of a long task anyway (tokenize drops stopwords).
const MAX_TASK_LEN = 256;

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
  // Preview-only records carry no screen; never rank one as a real verdict.
  const full = top ? await getScreenedVerdict(top.slug) : null;
  // Explicit field whitelist (not a spread): only opt-in fields reach the public
  // wire, so a future internal verdict field (origin, model id, ...) can't leak.
  // Keeps rationale (already public on /server/[slug]); drops per-dimension
  // evidence quotes; the shape feeds the keystone VerdictCard directly.
  const verdict = full
    ? {
        schema_version: full.schema_version,
        status: full.status,
        directive: {
          decision: full.directive.decision,
          rationale: full.directive.rationale,
          expires_at: full.directive.expires_at,
        },
        dimensions: full.dimensions.map((d) => ({
          id: d.id,
          verdict: d.verdict,
          severity: d.severity,
        })),
        granularity: full.granularity ?? null,
        honest_limits: full.honest_limits ?? null,
      }
    : null;

  return Response.json(
    {
      task,
      recommendations,
      screened_for: top?.slug ?? null,
      verdict, // advisory verdict | null (UPPERCASE enums, feeds VerdictCard directly)
      honest_limits: ADVISORY_FLOOR, // endpoint posture; verdict carries its own richer set
      verdict_contract_version: '1.0.0',
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Source': 'mcpindex.ai',
      },
    },
  );
}
