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
import { getScreenedVerdict } from '@/lib/verdicts';
import { ADVISORY_FLOOR } from '@/lib/honest-limits';
import { VERDICT_CONTRACT_VERSION } from '@/lib/verdictContract';

export const revalidate = 300;

// Import the floor, never re-declare it. This route used to carry its own copy of the
// three tokens; the values matched, but a local literal is an unguarded drift seam against
// what lib/honest-limits.ts calls the "single source of truth".
const FLOOR = ADVISORY_FLOOR;
const NO_VERDICT_LIMITS = [...FLOOR, 'no_verdict_data_in_v1_advisory'];

// `tool_name` is validated for SHAPE and then never checked for EXISTENCE - today's
// verdicts are description-level, so the server's screen is returned for any tool name a
// caller supplies. That is the documented design, but it means an agent that hallucinates
// a tool gets `verdict: PASS` back, and the loudest consumer of this route is
// check_tool_trust over the remote MCP endpoint. State the limit on the wire instead of
// only in a header comment: the response now says, in machine-readable form, that we did
// not confirm this tool is in the screened contract.
const TOOL_UNVERIFIED_LIMIT = 'tool_name_not_independently_verified';

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

  // Preview-only records are NOT a screening result - same guard the server-level
  // route applies, hoisted so the two endpoints cannot disagree on one subject.
  const v = await getScreenedVerdict(server_id);
  // tool_verified:false is stated on BOTH branches - the caveat is a property of how this
  // endpoint resolves tools, not of whether a verdict happened to exist.
  const subject = { server_id, tool_name, tool_verified: false };
  const body = v
    ? {
        subject,
        status: v.status,
        directive: v.directive.decision,
        granularity: v.granularity ?? null,
        dimensions: v.dimensions.map((d) => ({
          id: d.id,
          verdict: d.verdict,
          severity: d.severity,
        })),
        expires_at: v.directive.expires_at || null,
        honest_limits: [...new Set([...(v.honest_limits ?? [...FLOOR]), TOOL_UNVERIFIED_LIMIT])],
        verdict_contract_version: VERDICT_CONTRACT_VERSION,
      }
    : {
        subject,
        status: 'ERROR',
        directive: 'UNVERIFIED',
        granularity: null,
        dimensions: [],
        expires_at: null,
        honest_limits: [...NO_VERDICT_LIMITS, TOOL_UNVERIFIED_LIMIT],
        verdict_contract_version: VERDICT_CONTRACT_VERSION,
      };

  return Response.json(body, {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
