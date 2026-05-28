// V1 advisory trust verdict endpoint - per-tool.
//
// Returns the canonical free-tier verdict shape with directive=UNVERIFIED for
// every request in v1 advisory. The aggregator returns UNVERIFIED for every
// (server, tool) pair until per-tool verdicts are populated by the trust layer.
//
// Contract: returns HTTP 200 with status=ERROR + directive=UNVERIFIED. This is
// deliberately NOT a 404. A 404 would imply "we don't know this server"; we
// instead say "we know the server, we have no verdict yet." Agents must treat
// UNVERIFIED as fail-CLOSED and fall back to their own checks.
//
// Cache: 5 minutes. Short enough to refresh quickly once real verdicts start
// flowing from mcpindex-trust.

import type { NextRequest } from 'next/server';

type VerdictResponse = {
  subject: { server_id: string; tool_name: string };
  status: 'ERROR';
  directive: 'UNVERIFIED';
  dimensions: readonly never[];
  expires_at: null;
  honest_limits: readonly string[];
  verdict_contract_version: '1.0.0';
};

const HONEST_LIMITS = [
  'conformance_monitored_not_enforced',
  'calibrated_false_v1',
  'advisory_deployment',
  'no_verdict_data_in_v1_advisory',
] as const;

function decodeParam(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.length === 0) return null;
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
    return Response.json(
      { error: 'invalid path parameters' },
      { status: 400 },
    );
  }

  const body: VerdictResponse = {
    subject: { server_id, tool_name },
    status: 'ERROR',
    directive: 'UNVERIFIED',
    dimensions: [],
    expires_at: null,
    honest_limits: HONEST_LIMITS,
    verdict_contract_version: '1.0.0',
  };

  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
