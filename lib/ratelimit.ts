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

// Drift-telemetry ingest limit (/api/v1/drift). Batched, free (no LLM spend), so the per-IP
// ceiling is generous — it only exists to bound an abusive flood, not to ration a paid
// resource. A blocked request is dropped silently by the route (telemetry is lossy by
// design). Reuses the same Upstash instance + fail-open posture as the screen limiter.
const DRIFT_BATCH_PER_IP_PER_MIN = 120;
// Global daily ceiling on ACCEPTED batches. The per-IP limit is evadable by an attacker who
// rotates x-forwarded-for when not behind Vercel's edge; this caps the total damage (counter
// inflation + HyperLogLog cardinality poisoning of the M1 falsifier metrics) regardless of
// source-IP distribution. 200k batches/day is far above real opt-in telemetry volume.
const DRIFT_GLOBAL_BATCH_PER_DAY = 200_000;

export type DriftLimit = { ok: true } | { ok: false };

export async function checkDriftLimit(ip: string, now: Date): Promise<DriftLimit> {
  const r = redis();
  if (!r) return { ok: true }; // fail-open: drop-on-overflow is acceptable for telemetry

  const min = now.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
  const day = now.toISOString().slice(0, 10); // yyyy-mm-dd
  try {
    // Per-IP first; an IP-blocked request must NOT count toward the global ceiling.
    const ipKey = `drift:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > DRIFT_BATCH_PER_IP_PER_MIN) return { ok: false };

    // Global daily circuit-breaker — bounds metric-poisoning under IP spoofing.
    const gKey = `drift:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000); // ~25h
    return g > DRIFT_GLOBAL_BATCH_PER_DAY ? { ok: false } : { ok: true };
  } catch {
    return { ok: true }; // fail-open on Redis error
  }
}

// The fleet-query READ path (/api/v1/drift/any) gets a SEPARATE budget from ingest. The SDK
// queries this on every first pin (high volume by design), so sharing the ingest budget would
// let read traffic 429-STARVE telemetry ingest — silently dropping signals and poisoning the
// very falsifier metrics the ingest cap protects. Reads are cheap (a SISMEMBER), so the caps
// are higher; distinct `drift:read:*` keys keep the two budgets fully independent.
const DRIFT_READ_PER_IP_PER_MIN = 600;
const DRIFT_READ_GLOBAL_PER_DAY = 5_000_000;

export async function checkDriftReadLimit(ip: string, now: Date): Promise<DriftLimit> {
  const r = redis();
  if (!r) return { ok: true }; // fail-open

  const min = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  try {
    const ipKey = `drift:read:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > DRIFT_READ_PER_IP_PER_MIN) return { ok: false };

    const gKey = `drift:read:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000);
    return g > DRIFT_READ_GLOBAL_PER_DAY ? { ok: false } : { ok: true };
  } catch {
    return { ok: true }; // fail-open on Redis error
  }
}
