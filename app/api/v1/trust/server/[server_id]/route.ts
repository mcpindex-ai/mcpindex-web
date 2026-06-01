// V1 advisory trust verdict endpoint - server-level.
//
// Reads the seeded verdict store (data/verdicts.json) via the SAME getVerdict()
// the site pages use, so the public API and the website never disagree. Returns
// the real verdict when a server has been screened; UNVERIFIED (fail-closed)
// when there is no verdict on file. Fixtures are excluded by getVerdict.
//
// Contract: HTTP 200. directive is ALLOW/DENY/REVIEW for a real verdict, or
// UNVERIFIED when none exists. subject.tool_name is null at this (server) scope.
// Cache: 5 minutes - the refresh window verdicts roll out on.

import type { NextRequest } from 'next/server';
import { getVerdict } from '@/lib/verdicts';
import { ADVISORY_FLOOR as FLOOR } from '@/lib/honest-limits';

export const revalidate = 300;

const NO_VERDICT_LIMITS = [...FLOOR, 'no_verdict_data_in_v1_advisory'];

// Hard cap on subject identifiers - defends against cache-poison via long
// arbitrary strings (max-age=300 lets a crawler chew edge cache slots with
// 1000-char server_ids). 256 is generous for real slugs (~80 max today).
const MAX_PARAM_LEN = 256;

function decodeParam(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    if (decoded.length === 0 || decoded.length > MAX_PARAM_LEN) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ server_id: string }> },
) {
  const { server_id: rawServer } = await ctx.params;
  const server_id = decodeParam(rawServer);
  if (!server_id) {
    return Response.json({ error: 'invalid path parameters' }, { status: 400 });
  }

  const v = await getVerdict(server_id);
  const body = v
    ? {
        subject: { server_id, tool_name: null },
        status: v.status,
        directive: v.directive.decision,
        granularity: v.granularity ?? null,
        dimensions: v.dimensions.map((d) => ({
          id: d.id,
          verdict: d.verdict,
          severity: d.severity,
        })),
        expires_at: v.directive.expires_at || null,
        honest_limits: v.honest_limits ?? [...FLOOR],
        verdict_contract_version: '1.0.0',
      }
    : {
        subject: { server_id, tool_name: null },
        status: 'ERROR',
        directive: 'UNVERIFIED',
        granularity: null,
        dimensions: [],
        expires_at: null,
        honest_limits: NO_VERDICT_LIMITS,
        verdict_contract_version: '1.0.0',
      };

  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
