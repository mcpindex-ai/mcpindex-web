// Env-var normalization shared by every Upstash/KV consumer.
//
// WHY THIS FILE EXISTS. Vercel env vars are frequently provisioned as EMPTY strings
// (a Marketplace integration, a `vercel env add` that swallowed stdin, a cleared-but-
// not-deleted value). `??` only falls through on null/undefined — NOT on '' — so
//
//     process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
//
// yields '' whenever the first name exists-but-is-blank, the fallback never engages,
// and `url && token` is silently falsy. Every consumer then memoizes a null client and
// degrades quietly: limiters return ok:true (caps gone), read endpoints 503, and the
// drift/receipt ingest routes answer 204 while DISCARDING every signal. Nothing logs.
//
// This was fixed once, in app/.well-known/mcpindex-challenge/route.ts (commit ee64c2f),
// and the fix was never propagated — twelve other modules kept the bare chain. A footgun
// patched in one file and not grepped for siblings is a footgun with a 12/13 miss rate.
// Import `env` here rather than re-deriving it; that is the whole point of the module.

/** Trim, then treat blank/whitespace-only as ABSENT so `??` chains reach their fallbacks. */
export function env(v?: string): string | undefined {
  const t = (v ?? '').trim();
  return t.length ? t : undefined;
}

/**
 * The Upstash REST URL under either naming convention, or undefined.
 * `UPSTASH_*` is the direct-integration name; `KV_REST_API_*` is what the Vercel
 * Marketplace injects. Consumers must accept both — a project provisioned only one
 * way must not silently land in no-Redis mode.
 */
export function redisUrl(): string | undefined {
  return env(process.env.UPSTASH_REDIS_REST_URL) ?? env(process.env.KV_REST_API_URL);
}

/** The read-write Upstash REST token under either naming convention, or undefined. */
export function redisToken(): string | undefined {
  return env(process.env.UPSTASH_REDIS_REST_TOKEN) ?? env(process.env.KV_REST_API_TOKEN);
}

/** True when BOTH a URL and a read-write token resolve to non-blank values. */
export function redisConfigured(): boolean {
  return Boolean(redisUrl() && redisToken());
}
