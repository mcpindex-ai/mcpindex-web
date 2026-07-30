import { Redis } from '@upstash/redis';
import { redisUrl, redisToken } from './env';

// Which AI crawlers fetch /llms.txt and /llms-full.txt? Records an AI-bot fetch two ways: a
// structured console.log line (readable in Vercel runtime logs, short retention) and a durable
// Upstash counter keyed `aeo:{route}:{family}:{YYYYMMDD}` with a 120d TTL.
//
// CALLED FROM proxy.ts, NOT from the route handlers, and that placement is the whole design.
// A route handler only executes on a cache MISS, so counting there forced `Cache-Control:
// no-store` on both routes for the 2026-07-17..07-30 measurement window. That removed the CDN
// shield and exposed a ~25MB snapshot parse on every cold isolate, which timed out an external
// agent-accessibility audit and (plausibly) drove OpenAI's crawler off entirely. Proxy runs
// BEFORE the cache — verified 2026-07-30 against a live deploy: eight requests returning
// `x-vercel-cache: HIT` each produced a `[serverless-middleware] cache=HIT` log line. So
// counting here sees every fetch while both routes stay prerendered and edge-cached.
// Measurement and caching were never actually in tension; the counter was in the wrong layer.
//
// DO NOT move this back into a route handler, and DO NOT set no-store to "make counting work".
// That is the exact regression this placement exists to prevent.
//
// The caller MUST invoke this inside `event.waitUntil(...)` (NextFetchEvent). That adds zero
// TTFB and the platform keeps the isolate alive until the write settles — strictly better than
// the bare fire-and-forget the route handler used, which could silently drop a write if the
// isolate froze post-response.
//
// IMPORTANT — the unit of measure is ISOLATE-MINUTES, not raw fetch count. A per-isolate
// per-minute dedup (below) emits at most once per (route,family,UTC-minute) per isolate, so a
// flood cannot drive volume, and concurrency inflates the number above true wall-clock minutes.
// Read any nonzero as "this family fetched this route" (presence) — NEVER as a fetch count.
// Non-bot traffic records nothing. Fail-open everywhere: counting must never break a response.
//
// The key schema is deliberately unchanged from the 2026-07-17..07-30 window, whose result was:
// /llms.txt drew meta 302, openai 41, anthropic 1, amazon 1; /llms-full.txt drew ZERO from every
// vendor on every day. Absent entirely: perplexity, bytedance, cohere, commoncrawl.
//
// COMPARE PRESENCE, NOT MAGNITUDE. The schema carries over; the numbers do not, and reading a
// magnitude delta as a change in crawler behaviour would be a mistake. The unit is isolate-minutes,
// and the isolate population differs between the two regimes: under `no-store` every single request
// invoked a route function, whereas now the proxy fans out over its own pool while the routes are
// edge-cached. "Did family X fetch route Y" is comparable across the boundary. "How much" is not.

// AI-crawler User-Agent substrings -> family. Lowercased match. Regular search crawlers
// (Googlebot, Bingbot) are intentionally excluded; only AI/LLM fetchers with a distinct UA count.
//
// KNOWN BLIND SPOT: Google's Gemini and Apple's AI crawl under the *shared* Googlebot / Applebot
// User-Agents ("Google-Extended" / "Applebot-Extended" are robots.txt product tokens, NOT UA
// strings — they never appear in a request header). So Google/Apple AI fetches are indistinguishable
// from search-crawler traffic here and are deliberately out of scope. Do NOT read a zero for those
// vendors as "they don't fetch us." Also note the whole signal is SPOOFABLE (anyone can send
// `user-agent: gptbot`), so treat the counts as a floor to be corroborated against source IP /
// verified-bot reverse-DNS, not ground truth.
const BOT_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ['gptbot', 'openai'],
  ['oai-searchbot', 'openai'],
  ['chatgpt-user', 'openai'],
  ['claudebot', 'anthropic'],
  ['claude-user', 'anthropic'],
  ['claude-searchbot', 'anthropic'],
  ['anthropic-ai', 'anthropic'],
  ['perplexitybot', 'perplexity'],
  ['perplexity-user', 'perplexity'],
  ['bytespider', 'bytedance'],
  ['amazonbot', 'amazon'],
  ['meta-externalagent', 'meta'],
  ['cohere-ai', 'cohere'],
  ['ccbot', 'commoncrawl'],
];

/** Returns the AI-crawler family for a User-Agent, or null if it is not a known AI fetcher. */
export function classifyAeoBot(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const lower = ua.toLowerCase();
  for (const [needle, family] of BOT_PATTERNS) {
    if (lower.includes(needle)) return family;
  }
  return null;
}

// A hung Upstash must not hold a billable proxy invocation open indefinitely. Removing the old
// 300ms race (see recordAeoFetch) was right - under waitUntil the write SHOULD be awaited - but
// "awaited" must still be bounded: @upstash/redis defaults to 5 attempts with an exponential
// backoff (~4.2s of sleep alone) and sets NO per-request timeout, so a black-holed connection
// never settles. waitUntil would then pin the invocation until the platform cap, on every
// crawler request, for the whole duration of an Upstash brownout. 5s is deliberately generous:
// it preserves "the write lands whenever Upstash is healthy" while capping the pathological tail.
const WRITE_TIMEOUT_MS = 5_000;

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  _redis = url && token
    ? new Redis({ url, token, signal: () => AbortSignal.timeout(WRITE_TIMEOUT_MS) })
    : null;
  return _redis;
}

/**
 * Kill switch. Counting is ON by default - a missing env var must not silently stop measurement,
 * which is the failure this instrument exists to avoid. Set AEO_COUNT_DISABLED=1 to stop it
 * without a deploy.
 *
 * This is deliberately NOT wired through lib/flags.ts: that module is `import 'server-only'`, and
 * pulling it into the proxy (middleware) dependency chain would break the build. It also inverts
 * the flags.ts default-OFF convention on purpose - default-OFF is correct for a half-built path,
 * wrong for instrumentation whose whole job is to be running.
 */
function countingDisabled(): boolean {
  return process.env.AEO_COUNT_DISABLED === '1';
}

/** TEST-ONLY seam: override the shared client (mirrors lib/ratelimit.ts). */
export function __setAeoRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

/** TEST-ONLY seam: clear the per-minute write-dedup so each test starts fresh. */
export function __resetAeoDedupForTest(): void {
  _recentWrites.clear();
}

// 120d. Long enough that a quarter of history is always readable for trend work, short enough that
// the keyspace self-cleans without a reaper. Keys are per-day, so nothing accumulates unbounded.
const KEY_TTL_SECONDS = 120 * 24 * 60 * 60;

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
function minuteStamp(): string {
  return new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM (UTC)
}

// Per-instance, per-minute write de-dup: skip the Redis write + log once (route,family,minute) has
// already been recorded on this isolate. This DECOUPLES write/log volume from request volume — a
// distributed spoofed-`gptbot` flood (which the per-isolate 60/min limiter can't globally cap) can no
// longer drive 1:1 Upstash commands or log lines; each isolate emits at most (routes x families) writes
// per minute. Consequence: the durable counter measures ISOLATE-MINUTES (presence), not raw hits —
// which is exactly what the question needs ("do crawlers fetch this?"), and the raw count was already a
// spoofable floor.
const _recentWrites = new Map<string, number>();
const _DEDUP_PRUNE_MS = 120_000;

/**
 * Record a fetch of an AEO route. No-op for non-bot traffic and for a (route,family,minute) already
 * seen on this isolate. Never throws (fail-open) — a counting failure must never break a response.
 *
 * Pass this to `event.waitUntil(...)` from proxy.ts. waitUntil keeps the isolate alive until the
 * promise settles, so the write is awaited to completion here rather than raced against a timeout:
 * it costs the crawler no TTFB (the response is already on its way) and cannot be dropped by a
 * post-response freeze. The previous route-handler call site had neither property.
 */
export async function recordAeoFetch(route: 'llms' | 'llms-full', ua: string | null): Promise<void> {
  if (countingDisabled()) return;
  const family = classifyAeoBot(ua);
  if (!family) return;

  const dedupKey = `${route}:${family}:${minuteStamp()}`;
  if (_recentWrites.has(dedupKey)) return; // already recorded this route/family this minute on this isolate
  const now = Date.now();
  _recentWrites.set(dedupKey, now);
  if (_recentWrites.size > 4000) {
    for (const [k, t] of _recentWrites) if (now - t > _DEDUP_PRUNE_MS) _recentWrites.delete(k);
  }

  // Middleware runs on cache hits too, so this line appears for edge-served fetches as well —
  // it is the read path when Upstash is unconfigured or the runtime logs are all you have.
  console.log(`AEO_BOT_FETCH route=${route} family=${family}`);
  try {
    const r = redis();
    if (!r) return;
    const key = `aeo:${route}:${family}:${dayStamp()}`;
    // Single pipelined round trip: incr + expire ship together, so a failure can never land
    // BETWEEN them (no key left without a TTL) and latency is one RTT, not two. Awaited to
    // completion under waitUntil; the try/catch keeps it fail-open on a throw.
    await r.pipeline().incr(key).expire(key, KEY_TTL_SECONDS).exec();
  } catch {
    // fail-open: durable counter is best-effort; the console.log above still recorded the hit.
  }
}
