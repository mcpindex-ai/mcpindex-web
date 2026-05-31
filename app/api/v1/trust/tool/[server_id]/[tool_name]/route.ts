// V1 advisory trust verdict endpoint - per-tool.
//
// Reads the seeded verdict store (data/verdicts.json) via the SAME getVerdict()
// the site pages use, keyed by server slug. Today's verdicts are description-
// level (granularity surfaced in the response), so a server with a verdict
// returns that screen for any of its tools, honestly labeled by `granularity`
// and `honest_limits`. Returns UNVERIFIED (fail-closed) when no verdict exists.
//
// Contract: HTTP 200, NOT 404 - a 404 would imply "unknown server"; we instead
// say "we know the server, here is the verdict (or none yet)." Agents must treat
// UNVERIFIED as fail-CLOSED. Cache: 5 minutes.

import type { NextRequest } from 'next/server';
import { getVerdict } from '@/lib/verdicts';

export const revalidate = 300;

const FLOOR = [
  'conformance_monitored_not_enforced',
  'calibrated_false_v1',
  'advisory_deployment',
] as const;
const NO_VERDICT_LIMITS = [...FLOOR, 'no_verdict_data_in_v1_advisory'];

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
  ctx: { params: Promise<{ server_id: string; tool_name: string }> },
) {
  const { server_id: rawServer, tool_name: rawTool } = await ctx.params;
  const server_id = decodeParam(rawServer);
  const tool_name = decodeParam(rawTool);

  if (!server_id || !tool_name) {
    return Response.json({ error: 'invalid path parameters' }, { status: 400 });
  }

  const v = await getVerdict(server_id);
  const body = v
    ? {
        subject: { server_id, tool_name },
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
        subject: { server_id, tool_name },
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
