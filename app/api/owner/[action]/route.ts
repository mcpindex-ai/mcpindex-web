// Same-origin server proxy for the owner-verification wizard.
//
// The browser wizard POSTs here (same origin -> no CORS, no preflight, no cross-
// origin credential exposure) and this handler forwards each step server-to-server
// to the public owner API. Modeled on app/api/[transport]/route.ts: a FIXED upstream
// host (never derived from user input -> no SSRF), a bounded AbortSignal.timeout per
// call, status-only pass-through on upstream 5xx (never echo a verbose upstream body),
// and path-segment validation on the one user-controlled path input (serverId).
//
// The caller's api_key is REQUEST-SCOPED: read from the JSON body (never a query param,
// so it can't land in an access log / Referer), placed only in the outbound
// Authorization header, never logged, never stored.
//
// Env: MCPINDEX_OWNER_API_BASE overrides the upstream base for local/staging testing;
// it is an operator-set constant (NOT user input), so it never widens the SSRF surface.
// Default: https://owner.mcpindex.ai.
import type { NextRequest } from 'next/server';
import { checkOwnerLimit, checkOwnerBehaviorLimit } from '@/lib/ratelimit';

const OWNER_API_BASE = process.env.MCPINDEX_OWNER_API_BASE ?? 'https://owner.mcpindex.ai';

// Every proxied call egresses from the shared Vercel IP, so the upstream owner service's per-IP
// throttle collapses to one source; this per-IP cap restores that boundary at the edge. Header
// order mirrors the login route's resolver (x-vercel-forwarded-for is the trusted platform value).
function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// The slowest action (verify-behavior) allows a ~90s live crawl below. Raise the function
// duration cap above that so Vercel doesn't kill the invocation at its default (~10-15s)
// BEFORE our AbortSignal.timeout fires — otherwise the caller gets a platform 504 page
// instead of the controlled { error: 'upstream unavailable' } JSON. Requires a plan whose
// max function duration is >= 95s (Pro/Enterprise); on a lower cap the platform limit wins.
export const maxDuration = 95;

// api_key grammar: minted keys are `mcpk_` + an opaque token. Bound the length and
// restrict the charset so a malformed value fails fast here (before any upstream call)
// and can never smuggle control chars into the Authorization header.
const API_KEY_RE = /^mcpk_[A-Za-z0-9_-]{8,256}$/;

// serverId is a registry name (e.g. `io.github.you/srv`): alnum + dot/slash/hyphen/
// underscore, bounded. It is the ONLY user-controlled value that reaches an upstream
// path, so it is charset-validated here AND its `.`/`..` segments are rejected below.
const SERVER_ID_RE = /^[A-Za-z0-9._/-]{1,200}$/;

interface OwnerBody {
  apiKey?: unknown;
  serverId?: unknown;
  // step-specific params (closed vocabulary, picked per-action below)
  probe_safe_tools?: unknown;
  credential?: unknown;
  risk_acknowledged?: unknown;
}

interface Plan {
  method: 'GET' | 'POST';
  timeoutMs: number;
  // Build the upstream path + optional JSON body from the validated serverId + parsed body.
  build: (serverId: string, body: OwnerBody) => { path: string; json?: Record<string, unknown> };
}

// Encode each path segment but keep the slash structure the owner service expects on
// the remainder after /owner/tools/ (serverId legitimately contains a slash). `.`/`..`
// segments are rejected upstream in encodeServerPath -> no path traversal on the origin.
function encodeServerPath(serverId: string): string {
  return serverId.split('/').map(encodeURIComponent).join('/');
}

// CLOSED allowlist. An action outside these keys -> 404 (closed vocabulary). Each entry
// hand-picks the outbound body fields (never spreads the raw request), so apiKey and any
// unexpected caller field can't be forwarded to the upstream.
const ACTIONS: Record<string, Plan> = {
  challenge: {
    method: 'POST',
    timeoutMs: 20_000,
    build: (server_id) => ({ path: '/owner/challenge', json: { server_id } }),
  },
  'verify-ownership': {
    method: 'POST',
    timeoutMs: 20_000,
    build: (server_id) => ({ path: '/owner/verify-ownership', json: { server_id } }),
  },
  tools: {
    method: 'GET',
    timeoutMs: 20_000,
    build: (server_id) => ({ path: `/owner/tools/${encodeServerPath(server_id)}` }),
  },
  attest: {
    method: 'POST',
    timeoutMs: 20_000,
    build: (server_id, body) => ({
      path: '/owner/attest',
      json: { server_id, probe_safe_tools: body.probe_safe_tools },
    }),
  },
  'verify-behavior': {
    method: 'POST',
    // Live behavioral crawl -> allow ~90s (the others are quick control-plane calls).
    timeoutMs: 90_000,
    build: (server_id, body) => {
      const json: Record<string, unknown> = { server_id };
      if (body.credential !== undefined) json.credential = body.credential;
      if (body.risk_acknowledged !== undefined) json.risk_acknowledged = body.risk_acknowledged;
      return { path: '/owner/verify-behavior', json };
    },
  },
  publish: {
    method: 'POST',
    timeoutMs: 20_000,
    build: (server_id) => ({ path: '/owner/publish', json: { server_id, consent_publish: true } }),
  },
  result: {
    method: 'GET',
    timeoutMs: 20_000,
    build: (server_id) => ({ path: `/owner/result/${encodeServerPath(server_id)}` }),
  },
};

// no-store on every response: verification state is per-request and auth-scoped; nothing
// here is cacheable at the edge or in the browser.
function reply(data: unknown, status: number): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await ctx.params;
  const plan = ACTIONS[action];
  // Unknown action -> 404 closed-vocab (do this before touching the body).
  if (!plan) return reply({ error: 'unknown action' }, 404);

  // Per-IP rate limit BEFORE parsing the body / relaying upstream: the shared Vercel egress IP
  // would otherwise defeat the owner service's per-IP bucket. Fail-open inside the limiters.
  const ip = clientIp(req);
  const now = new Date();
  const limit = await checkOwnerLimit(ip, now);
  if (!limit.ok) {
    return reply({ error: 'rate_limited' }, 429);
  }
  // verify-behavior holds a ~90s serverless invocation while the upstream runs a live crawl,
  // so it gets a MUCH tighter per-IP cap on top of the general one (cost/DoS amplification).
  if (action === 'verify-behavior') {
    const heavy = await checkOwnerBehaviorLimit(ip, now);
    if (!heavy.ok) return reply({ error: 'rate_limited' }, 429);
  }

  let body: OwnerBody;
  try {
    body = (await req.json()) as OwnerBody;
  } catch {
    return reply({ error: 'invalid JSON body' }, 400);
  }
  if (!body || typeof body !== 'object') return reply({ error: 'invalid JSON body' }, 400);

  const apiKey = body.apiKey;
  if (typeof apiKey !== 'string' || !API_KEY_RE.test(apiKey)) {
    return reply({ error: 'missing or invalid apiKey' }, 400);
  }

  const serverId = body.serverId;
  if (typeof serverId !== 'string' || !SERVER_ID_RE.test(serverId)) {
    return reply({ error: 'missing or invalid serverId' }, 400);
  }
  // Defense-in-depth for path-mapped actions: reject `.`/`..`/empty segments so an
  // encoded serverId can never walk the upstream /owner path.
  if (serverId.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return reply({ error: 'missing or invalid serverId' }, 400);
  }

  const { path, json } = plan.build(serverId, body);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'User-Agent': 'mcpindex-owner-proxy/1.0',
  };
  if (json !== undefined) headers['Content-Type'] = 'application/json';

  let upstream: Response;
  try {
    upstream = await fetch(`${OWNER_API_BASE}${path}`, {
      method: plan.method,
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: AbortSignal.timeout(plan.timeoutMs),
      // Never auto-follow an upstream redirect: a 3xx from a compromised/misconfigured owner
      // service must not be chased to an arbitrary Location (and a followed 3xx->2xx would
      // dodge the status strips below). Matches the redirect:'manual' convention in loginOAuth.
      redirect: 'manual',
    });
  } catch (e) {
    // Network failure or timeout -> generic, no upstream detail. Distinguish only the
    // status code so the wizard can tell "took too long" from "couldn't reach".
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    return reply({ error: 'upstream unavailable' }, timedOut ? 504 : 502);
  }

  // A 3xx (only reachable now via redirect:'manual') is not a valid owner-API response ->
  // treat as unavailable rather than passing it through. Upstream 5xx: never echo the (possibly
  // verbose) upstream body -> generic 502.
  if (upstream.status >= 300 && upstream.status < 400) {
    return reply({ error: 'upstream unavailable' }, 502);
  }
  if (upstream.status >= 500) {
    return reply({ error: 'upstream unavailable' }, 502);
  }

  // Re-parse + re-emit as JSON so a non-JSON upstream body never leaks.
  const raw = await upstream.text();
  let data: unknown;
  try {
    data = raw === '' ? {} : JSON.parse(raw);
  } catch {
    return reply({ error: 'upstream unavailable' }, 502);
  }
  // On a 4xx the wizard only ever reads {error} + the status (via errorLine/statusHint), so
  // reduce the response to exactly that. This prevents any upstream 4xx body detail (validation
  // echoes, internal identifiers, a 409's cross-record hints) from reaching the browser.
  if (upstream.status >= 400) {
    const obj = data as Record<string, unknown> | null;
    // Cap the length: the wizard only needs a short human hint, and a bounded string limits the
    // blast radius of any verbose detail an upstream error message might accidentally carry.
    const err = obj && typeof obj.error === 'string' ? obj.error.slice(0, 300) : 'request rejected';
    return reply({ error: err }, upstream.status);
  }
  // 2xx: the intended success payload the wizard renders — pass through.
  return reply(data, upstream.status);
}
