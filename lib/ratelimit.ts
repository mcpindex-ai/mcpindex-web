// Distributed rate limit + global cost cap for the LLM-backed screen endpoint.
// proxy.ts has a per-INSTANCE in-memory limit; on serverless that lets an
// IP-rotating attacker drive unbounded Groq spend. This adds a SHARED (Upstash)
// per-IP limit AND a global daily call ceiling - the cost circuit-breaker that
// bounds spend regardless of source-IP distribution.
//
// Fail-OPEN if Upstash is unconfigured or errors: never break the demo on a
// Redis hiccup; the proxy.ts per-IP limit remains the backstop. (The global cap
// is best-effort by design - it protects cost when Redis is healthy.)

import 'server-only'; // build-time tripwire: this module holds the Upstash REST token; never bundle to the client
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

/** TEST-ONLY seam (mirrors the drift/receipt/login modules): override the shared client so a suite
 * can drive the 429 branch of every limiter. `undefined` resets to lazy env resolution, `null`
 * forces the unconfigured (fail-open) path, a mock object drives limited/over-limit responses. */
export function __setRatelimitRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

const PER_IP_PER_MIN = 10; // tighter than the general /api/v1/* 60/min - this one costs money
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
// ceiling is generous - it only exists to bound an abusive flood, not to ration a paid
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

    // Global daily circuit-breaker - bounds metric-poisoning under IP spoofing.
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
// let read traffic 429-STARVE telemetry ingest - silently dropping signals and poisoning the
// very falsifier metrics the ingest cap protects. Reads are cheap (a SISMEMBER), so the caps
// are higher; distinct `drift:read:*` keys keep the two budgets fully independent.
const DRIFT_READ_PER_IP_PER_MIN = 600;
const DRIFT_READ_GLOBAL_PER_DAY = 5_000_000;

// Drift identity register limit (/api/v1/drift/register). Tighter than ingest - registration
// is an abuse vector (identity minting). Fail-open on Redis error.
const REGISTER_PER_IP_PER_MIN = 10;
// Per-IP limit is the real abuse control; global cap is only a blast-radius backstop.
const REGISTER_GLOBAL_PER_DAY = 200_000;

export async function checkRegisterLimit(ip: string, now: Date): Promise<DriftLimit> {
  const r = redis();
  if (!r) return { ok: true };

  const min = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  try {
    const ipKey = `drift:register:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > REGISTER_PER_IP_PER_MIN) return { ok: false };

    const gKey = `drift:register:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000);
    return g > REGISTER_GLOBAL_PER_DAY ? { ok: false } : { ok: true };
  } catch {
    return { ok: true };
  }
}

// Drift OAuth upgrade limit (/api/v1/drift/oauth/*). Tighter than ingest - OAuth is an abuse vector.
const OAUTH_PER_IP_PER_MIN = 10;
const OAUTH_GLOBAL_PER_DAY = 100_000;

export async function checkOAuthLimit(ip: string, now: Date): Promise<DriftLimit> {
  const r = redis();
  if (!r) return { ok: true };

  const min = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  try {
    const ipKey = `drift:oauth:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > OAUTH_PER_IP_PER_MIN) return { ok: false };

    const gKey = `drift:oauth:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000);
    return g > OAUTH_GLOBAL_PER_DAY ? { ok: false } : { ok: true };
  } catch {
    return { ok: true };
  }
}

// Self-serve login limit (/api/auth/login/start). Each start writes a state key to the shared
// Upstash BEFORE any GitHub call and ultimately mints a free api_key, so it's a pre-auth cost/abuse
// vector against the shared datastore. Tight per-IP like the other minting endpoints; a global
// daily cap bounds blast radius under x-forwarded-for spoofing. Own `login:*` counters so it never
// shares (or 429-starves) the drift oauth budget. Fail-OPEN on a Redis error is safe here: if
// Upstash is down the state store (same instance) can't write either, so login is unavailable
// regardless - the limiter failing open adds no exposure.
const LOGIN_PER_IP_PER_MIN = 10;
const LOGIN_GLOBAL_PER_DAY = 50_000;

export async function checkLoginLimit(ip: string, now: Date): Promise<DriftLimit> {
  const r = redis();
  if (!r) return { ok: true };

  const min = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  try {
    const ipKey = `login:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > LOGIN_PER_IP_PER_MIN) return { ok: false };

    const gKey = `login:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000);
    return g > LOGIN_GLOBAL_PER_DAY ? { ok: false } : { ok: true };
  } catch {
    return { ok: true };
  }
}

// Receipt-plane ingest limit (/api/v1/receipts). A SEPARATE budget from drift so a receipt
// flood can't 429-starve drift telemetry (and vice-versa) - the two opt-in planes share the
// Upstash instance but never share a counter. Same shape/posture as checkDriftLimit: batched,
// free (no LLM spend), generous per-IP ceiling that only bounds an abusive flood, a global
// daily cap to bound metric/HLL poisoning under x-forwarded-for spoofing, and fail-OPEN on a
// Redis error (a dropped receipt batch is acceptable - the plane is lossy by design).
const RECEIPT_BATCH_PER_IP_PER_MIN = 120;
const RECEIPT_GLOBAL_BATCH_PER_DAY = 200_000;

export async function checkReceiptLimit(ip: string, now: Date): Promise<DriftLimit> {
  const r = redis();
  if (!r) return { ok: true }; // fail-open: drop-on-overflow is acceptable for telemetry

  const min = now.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
  const day = now.toISOString().slice(0, 10); // yyyy-mm-dd
  try {
    // Per-IP first; an IP-blocked request must NOT count toward the global ceiling.
    const ipKey = `receipt:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > RECEIPT_BATCH_PER_IP_PER_MIN) return { ok: false };

    // Global daily circuit-breaker - bounds metric/HLL poisoning under IP spoofing.
    const gKey = `receipt:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000); // ~25h
    return g > RECEIPT_GLOBAL_BATCH_PER_DAY ? { ok: false } : { ok: true };
  } catch {
    return { ok: true }; // fail-open on Redis error
  }
}

// Lead-form send limit (/api/waitlist source=contact|pricing, /api/enterprise).
// These are UNAUTHENTICATED and, when Brevo is wired, send a welcome email to the
// CALLER-SUPPLIED address and notify the operator inbox on every accepted call.
// Without a distributed cap an IP-rotating attacker can email-bomb arbitrary victims
// with mcpindex-branded mail and flood the operator inbox, burning Brevo quota and
// sender-domain reputation. proxy.ts's per-INSTANCE limit doesn't bound this across
// serverless instances, so mirror the screen limiter: shared per-IP + a global daily
// ceiling. Real lead volume is a handful/day, so the caps are deliberately low.
// Fail-OPEN on Redis error/unconfigured (never break a genuine lead on a Redis hiccup;
// proxy.ts remains the per-instance backstop).
const LEAD_PER_IP_PER_MIN = 5;
const LEAD_GLOBAL_PER_DAY = 500; // hard daily ceiling on outbound lead emails regardless of IP

export type LeadLimit = { ok: true } | { ok: false; reason: 'ip' | 'global' };

export async function checkLeadLimit(ip: string, now: Date): Promise<LeadLimit> {
  const r = redis();
  if (!r) return { ok: true }; // fail-open: proxy.ts per-instance limit is the backstop

  const min = now.toISOString().slice(0, 16); // yyyy-mm-ddThh:mm
  const day = now.toISOString().slice(0, 10); // yyyy-mm-dd
  try {
    // Per-IP first; an IP-blocked request must NOT count toward the global cap.
    const ipKey = `lead:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > LEAD_PER_IP_PER_MIN) return { ok: false, reason: 'ip' };

    // Global daily circuit-breaker: bounds a distributed / IP-rotating email flood.
    const gKey = `lead:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000); // ~25h
    if (g > LEAD_GLOBAL_PER_DAY) return { ok: false, reason: 'global' };

    return { ok: true };
  } catch {
    return { ok: true }; // fail-open on Redis error
  }
}

// Owner-verification proxy limit (/api/owner/[action]). The browser wizard relays each step
// through this same-origin proxy to owner.mcpindex.ai. Every proxied call egresses from the
// SHARED Vercel IP, so the upstream owner service's per-IP token bucket collapses to one source
// and cannot throttle a single abusive browser client - this per-IP cap restores that boundary
// at the edge. It also bounds serverless invocations (verify-behavior holds one up to ~95s) and
// pre-auth relaying of format-valid-but-bogus keys upstream. Own `owner:*` counters so it never
// shares (or 429-starves) the login/drift budgets. Fail-OPEN on a Redis error/unconfigured: the
// upstream service is authoritative on auth + abuse, so the proxy limiter is defense-in-depth.
const OWNER_PER_IP_PER_MIN = 20;
const OWNER_GLOBAL_PER_DAY = 100_000;

export async function checkOwnerLimit(ip: string, now: Date): Promise<DriftLimit> {
  const r = redis();
  if (!r) return { ok: true }; // fail-open: the upstream owner service is the authoritative gate

  const min = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  try {
    const ipKey = `owner:ip:${ip}:${min}`;
    const c = await r.incr(ipKey);
    if (c === 1) await r.expire(ipKey, 70);
    if (c > OWNER_PER_IP_PER_MIN) return { ok: false };

    const gKey = `owner:global:${day}`;
    const g = await r.incr(gKey);
    if (g === 1) await r.expire(gKey, 90_000);
    return g > OWNER_GLOBAL_PER_DAY ? { ok: false } : { ok: true };
  } catch {
    return { ok: true }; // fail-open on Redis error
  }
}

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
