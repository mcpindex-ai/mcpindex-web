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
  // Accept both naming conventions: Upstash-native (UPSTASH_REDIS_REST_*) and
  // Vercel Marketplace / KV (KV_REST_API_*). The integration injects one or the
  // other depending on how it's added; tolerate both so provisioning "just works".
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

const PER_IP_PER_MIN = 10; // tighter than the general /api/v1/* 60/min — this one costs money
const GLOBAL_PER_DAY = 5000; // hard daily ceiling on Groq calls regardless of IP

export type ScreenLimit = { ok: true } | { ok: false; reason: 'ip' | 'global' };

// Lead capture (/api/waitlist). Each accepted lead can trigger up to 3 Brevo
// sends; Brevo's free tier is 300 emails/day. These bounds protect that quota
// from an abuser without throttling real signups.
const WAITLIST_PER_IP_PER_MIN = 5;
// Separate daily ceilings per source so a flood of free waitlist signups can't
// starve higher-value pricing leads. Sum (300) stays within Brevo's 300/day.
const WAITLIST_GLOBAL_PER_DAY: Record<WaitlistSource, number> = { waitlist: 200, pricing: 100 };

export type WaitlistSource = 'waitlist' | 'pricing';
export type WaitlistLimit = { ok: true } | { ok: false; reason: 'ip' | 'global' };

// In-memory per-instance backstop for when Upstash is unconfigured OR errors.
// Serverless instances are short-lived so this is weaker than Redis, but it turns
// "fail-open = no limit at all" into "fail-open = bounded per instance" for a
// public endpoint that spends real money + email quota. Keys are time-bucketed
// (minute / day), so stale entries simply stop being hit; a size cap bounds memory.
const memIp = new Map<string, number>();
const memGlobal = new Map<string, number>();
function memUnder(map: Map<string, number>, key: string, limit: number): boolean {
  if (map.size > 10_000) map.clear(); // crude prune; only loosens limits briefly
  const n = (map.get(key) ?? 0) + 1;
  map.set(key, n);
  return n <= limit;
}
function memCheck(ip: string, source: WaitlistSource, min: string, day: string): WaitlistLimit {
  if (!memUnder(memIp, `${ip}:${min}`, WAITLIST_PER_IP_PER_MIN)) return { ok: false, reason: 'ip' };
  if (!memUnder(memGlobal, `${source}:${day}`, WAITLIST_GLOBAL_PER_DAY[source]))
    return { ok: false, reason: 'global' };
  return { ok: true };
}

export async function checkWaitlistLimit(
  ip: string,
  source: WaitlistSource,
  now: Date,
): Promise<WaitlistLimit> {
  const min = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  const r = redis();
  if (!r) return memCheck(ip, source, min, day); // no Redis -> in-memory backstop

  try {
    const ipKey = `waitlist:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > WAITLIST_PER_IP_PER_MIN) return { ok: false, reason: 'ip' };

    const gKey = `waitlist:global:${source}:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000); // ~25h
    if (g > WAITLIST_GLOBAL_PER_DAY[source]) return { ok: false, reason: 'global' };

    return { ok: true };
  } catch {
    return memCheck(ip, source, min, day); // Redis error -> backstop, not no-limit
  }
}

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
