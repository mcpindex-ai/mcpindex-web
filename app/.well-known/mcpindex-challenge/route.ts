import { Redis } from '@upstash/redis';

// Ownership-verification well-known endpoint. An MCP server owner proves control of
// their remote's origin by publishing a one-time challenge token here (the mcpindex
// owner service issues the token and stores it in Redis, keyed by the requesting
// origin host). The verifier GETs this path at the origin root and constant-time
// compares the body to the token. Fail-closed: no active challenge -> 404.
export const dynamic = 'force-dynamic'; // short-lived token, never cache

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
}

export async function GET(req: Request) {
  const r = redis();
  if (!r) return new Response('not configured', { status: 503 });
  const host = (req.headers.get('host') ?? '').toLowerCase();
  // @upstash/redis auto-JSON-parses on read; the token was stored as a JSON string,
  // so it round-trips back to the exact string. String() guards any non-string shape.
  const token = await r.get<string>(`owner:challenge:${host}`);
  if (!token) return new Response('no active challenge', { status: 404 });
  return new Response(String(token), {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}
