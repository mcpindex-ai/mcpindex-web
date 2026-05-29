// V1 advisory trust verdict endpoint - server-level (aggregate).
//
// Server-level verdicts aggregate across all tools exposed by a server. In v1
// advisory the aggregator returns UNVERIFIED for every server until per-tool
// verdicts are populated by mcpindex-trust; once tool verdicts start flowing,
// the aggregator will compute a worst-case (or policy-defined) roll-up across
// the server's tool set. Until then, the honest answer is UNVERIFIED.
//
// Contract: returns HTTP 200 with status=ERROR + directive=UNVERIFIED.
// subject.tool_name is null at this endpoint (server-scope).
//
// Cache: 5 minutes. Same refresh window as the per-tool endpoint.

import type { NextRequest } from 'next/server';

type VerdictResponse = {
  subject: { server_id: string; tool_name: null };
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

// Hard cap on subject identifiers. Defends against cache-poison via long
// arbitrary strings (Cache-Control max-age=300 means a hostile crawler could
// chew through Vercel edge cache slots with 1000-char server_ids that all
// 200-OK back the same UNVERIFIED stub). 256 chars is generous for real
// server_ids (longest in the registry today is ~80 chars) and tight enough
// to bound the reflection surface.
const MAX_PARAM_LEN = 256;

function decodeParam(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const decoded = decodeURIComponent(raw).trim();
    if (decoded.length === 0) return null;
    if (decoded.length > MAX_PARAM_LEN) return null;
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
    return Response.json(
      { error: 'invalid path parameters' },
      { status: 400 },
    );
  }

  const body: VerdictResponse = {
    subject: { server_id, tool_name: null },
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
