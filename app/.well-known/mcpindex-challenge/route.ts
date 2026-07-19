import { Redis } from '@upstash/redis';

// Ownership-verification well-known endpoint. An MCP server owner proves control of
// their remote's origin by publishing a one-time challenge token here (the mcpindex
// owner service issues the token and stores it in Redis, keyed by the requesting
// origin host). The verifier GETs this path at the origin root and constant-time
// compares the body to the token. Fail-closed: no active challenge -> 404.
export const dynamic = 'force-dynamic'; // short-lived token, never cache

// Fail-closed host allowlist. The challenge is only ever published for THIS site's
// canonical origins; keying Redis by an arbitrary client-supplied Host header would turn
// the endpoint into a cross-origin token-read oracle (a spoofed Host of any string maps to
// `owner:challenge:<that host>`). Only these normalized hosts are served; anything else 404s.
const CANONICAL_HOSTS = new Set<string>([
  'mcpindex.ai',
  'www.mcpindex.ai',
  'localhost',
  '127.0.0.1',
]);

// Lowercase, trim, and strip any :port. IPv6 literals are not allowlisted, so a plain
// split-on-colon is safe for the canonical hosts above.
function normalizeHost(raw: string | null): string {
  return (raw ?? '').toLowerCase().trim().split(':')[0];
}

// Vercel env vars are frequently provisioned as EMPTY strings, and `??` only falls
// through on null/undefined — not on ''. Normalize blank/whitespace to undefined so the
// ?? chains below actually reach their fallbacks (matches the trust-side writer's
// .strip()-then-treat-empty-as-absent behavior).
const env = (v?: string): string | undefined => {
  const t = (v ?? '').trim();
  return t.length ? t : undefined;
};

function redis(): Redis | null {
  const url =
    env(process.env.UPSTASH_REDIS_REST_URL) ?? env(process.env.KV_REST_API_URL);
  // Least privilege: a public read-only endpoint must not hold a write-capable credential.
  // Prefer the read-only token; fall back only if a scoped one is not provisioned.
  const token =
    env(process.env.KV_REST_API_READ_ONLY_TOKEN) ??
    env(process.env.UPSTASH_REDIS_REST_TOKEN) ??
    env(process.env.KV_REST_API_TOKEN);
  return url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
}

export async function GET(req: Request) {
  // Host-allowlist FIRST (fail-closed): never touch Redis for a non-canonical host.
  const host = normalizeHost(req.headers.get('host'));
  if (!CANONICAL_HOSTS.has(host)) return new Response('not found', { status: 404 });
  const r = redis();
  if (!r) return new Response('not configured', { status: 503 });
  // @upstash/redis auto-JSON-parses on read; the token was stored as a JSON string,
  // so it round-trips back to the exact string. String() guards any non-string shape.
  const token = await r.get<string>(`owner:challenge:${host}`);
  if (!token) return new Response('no active challenge', { status: 404 });
  return new Response(String(token), {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
