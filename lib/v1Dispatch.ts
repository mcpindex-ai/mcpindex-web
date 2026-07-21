import 'server-only';
import { NextRequest } from 'next/server';

// In-process dispatch of /api/v1 paths to their route handlers, for callers that live INSIDE
// this deployment (today: the remote-MCP endpoint at app/api/[transport]/route.ts).
//
// WHY NOT `fetch`. The MCP endpoint used to call https://mcpindex.ai/api/v1/... over the
// network - a round trip from the function back into its own deployment. That caused three
// problems, all structural:
//   1. RATE-LIMIT SELF-STARVATION. Re-entrant hops arrived from the shared Vercel EGRESS ip,
//      so all MCP-driven traffic shared ONE `api:<egress-ip>` bucket in proxy.ts. A single
//      compare_servers call fans out 5 of them, so heavy MCP use could 429 itself AND
//      unrelated public API users on the same instance.
//   2. PREVIEW DEPLOYMENTS SERVED PRODUCTION DATA. The base URL defaulted to the prod host,
//      so /api/mcp on a preview answered from prod and MCP changes could not be validated
//      before shipping.
//   3. It added DNS/TLS/egress failure modes unrelated to producing the answer.
//
// Handlers are IMPORTED AND CALLED, never reimplemented, so the MCP surface and the public
// REST surface cannot return differently-shaped answers - there is no second copy to drift.
import { GET as v1Search } from '@/app/api/v1/search/route';
import { GET as v1Recommend } from '@/app/api/v1/recommend/route';
import { GET as v1Server } from '@/app/api/v1/server/[slug]/route';
import { GET as v1TrustServer } from '@/app/api/v1/trust/server/[server_id]/route';
import { GET as v1TrustTool } from '@/app/api/v1/trust/tool/[server_id]/[tool_name]/route';

/** Base used only to make a WHATWG URL from a path. No request leaves the process. */
export const ROUTE_BASE = 'https://mcpindex.ai';

/** Default ceiling on how long a caller waits for one dispatch. */
export const DISPATCH_TIMEOUT_MS = 8000;

/**
 * Route a parsed /api/v1 URL to its handler. Returns null when nothing matches, so an
 * unroutable path is a loud caller error rather than a silent empty answer.
 */
export function routeV1(url: URL): Promise<Response> | null {
  const req = new NextRequest(url);
  // decodeURIComponent each segment: callers percent-encode slugs/tool names into the path.
  const p = url.pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  if (p[0] !== 'api' || p[1] !== 'v1') return null;
  if (p.length === 3 && p[2] === 'recommend') return v1Recommend(req);
  if (p.length === 3 && p[2] === 'search') return v1Search(req);
  if (p.length === 4 && p[2] === 'server') {
    return v1Server(req, { params: Promise.resolve({ slug: p[3]! }) });
  }
  if (p.length === 5 && p[2] === 'trust' && p[3] === 'server') {
    return v1TrustServer(req, { params: Promise.resolve({ server_id: p[4]! }) });
  }
  if (p.length === 6 && p[2] === 'trust' && p[3] === 'tool') {
    return v1TrustTool(req, { params: Promise.resolve({ server_id: p[4]!, tool_name: p[5]! }) });
  }
  return null;
}

/**
 * Resolve an /api/v1 path in-process and return its parsed JSON.
 * Throws on an unroutable path, a non-2xx status, or the timeout - matching the
 * throw-on-failure contract the previous `fetch`-based helper had, so callers are unchanged.
 */
export async function callV1<T = unknown>(
  path: string,
  timeoutMs: number = DISPATCH_TIMEOUT_MS,
): Promise<T> {
  const url = new URL(path, ROUTE_BASE);
  const call = routeV1(url);
  if (!call) throw new Error(`mcpindex API: unroutable path ${url.pathname}`);
  const res = await withTimeout(call, timeoutMs);
  // Status only - never echo the body (avoids surfacing a verbose 5xx to callers).
  if (!res.ok) throw new Error(`mcpindex API ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Reject with "mcpindex API timeout" if `p` has not settled within `ms`.
 *
 * Bounds what the CALLER waits for. NOTE: unlike an AbortSignal on a fetch this RACES rather
 * than CANCELS - it cannot interrupt CPU-bound work already running (e.g. a cold 21MB
 * snapshot parse). That is acceptable here: the ceiling exists to stop one slow resolve from
 * holding an unauthenticated invocation open to maxDuration, not to save the work.
 *
 * Exported so the timeout is directly testable with a controlled promise; racing against a
 * real handler is nondeterministic, because a warm-cache handler resolves before even a 0ms
 * timer fires (a fast success winning the race is correct, so such a test proves nothing).
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error('mcpindex API timeout')), ms);
    }),
    // clearTimeout on settle so a fast success does not keep the event loop alive for `ms`.
  ]).finally(() => clearTimeout(timer));
}
