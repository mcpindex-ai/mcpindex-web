// Distributed rate limit + global cost cap for the LLM-backed screen endpoint.
// proxy.ts has a per-INSTANCE in-memory limit; on serverless that lets an
// IP-rotating attacker drive unbounded Groq spend. This adds a SHARED (Upstash)
// per-IP limit AND a global daily call ceiling — the cost circuit-breaker that
// bounds spend regardless of source-IP distribution.
//
// Fail-OPEN if Upstash is unconfigured or errors: never break the demo on a
// Redis hiccup; the proxy.ts per-IP limit remains the backstop. (The global cap
// is best-effort by design — it protects cost when Redis is healthy.)

import { Redis } from '@upstash/redis';

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

const PER_IP_PER_MIN = 10; // tighter than the general /api/v1/* 60/min — this one costs money
const GLOBAL_PER_DAY = 5000; // hard daily ceiling on Groq calls regardless of IP

export type ScreenLimit = { ok: true } | { ok: false; reason: 'ip' | 'global' };

export async function checkScreenLimit(ip: string, now: Date): Promise<ScreenLimit> {
  const r = redis();
  if (!r) return { ok: true }; // fail-open: proxy.ts per-IP limit is the backstop

  const min = now.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
  const day = now.toISOString().slice(0, 10); // yyyy-mm-dd
  try {
    // Per-IP first; an IP-blocked request must NOT count toward the global cap.
    const ipKey = `screen:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > PER_IP_PER_MIN) return { ok: false, reason: 'ip' };

    // Global daily circuit-breaker (counts requests we're about to serve).
    const gKey = `screen:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000); // ~25h
    if (g > GLOBAL_PER_DAY) return { ok: false, reason: 'global' };

    return { ok: true };
  } catch {
    return { ok: true }; // fail-open on Redis error
  }
}
