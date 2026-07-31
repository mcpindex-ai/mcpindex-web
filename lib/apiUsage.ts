import { Redis } from '@upstash/redis';
import { redisUrl, redisToken } from './env';
import { classifyAeoBot } from './aeoCounter';

// Durable per-day call counters for the three surfaces the monthly metrics snapshot reports:
// the hosted MCP endpoint, the preflight API, and the public drift ledger page.
//
// WHY THIS EXISTS AT ALL. Vercel runtime-log retention on this project is ~24h, and the logs
// API does NOT error on a window it cannot serve — grouping by requestPath with `since=1d`,
// `since=7d` and `since=30d` returned identical counts on 2026-07-31 (/claim 508/507/507,
// /api/mcp 168/169/168, ~2037 distinct paths in all three). So "30 days of traffic" read from
// logs is silently 24 hours of traffic. Web Analytics is not enabled on the project (404).
// Nothing durable was recording these numbers, which means every month before this one is
// permanently unrecoverable. This file is the fix.
//
// CALLED FROM proxy.ts, NOT from the route handlers — and like lib/aeoCounter.ts, that
// placement is the whole design. A route handler only runs on a cache MISS, so /ledger (a
// prerendered, edge-cached page) would be invisible from there, and the last attempt at
// handler-side counting forced `Cache-Control: no-store`, removed the CDN shield, exposed a
// ~25MB parse per cold isolate and timed out an external audit. Proxy runs BEFORE the cache.
// Read lib/aeoCounter.ts's header before moving any of this.
//
// HOW THIS DIFFERS FROM aeoCounter — read before copying patterns between them:
//   * NO per-isolate dedup. aeoCounter dedups (route, family, minute) because it measures
//     PRESENCE ("do crawlers fetch this?"). This measures VOLUME, so a dedup would silently
//     under-report the exact number being reported as evidence. Do not add one.
//   * Non-bot traffic IS counted. aeoCounter records nothing for humans; here they are the point.
//   * 400d TTL, not 120d, so a full year plus a margin is always readable for a trend line.
//
// The counter is a floor, not ground truth, in two directions worth knowing:
//   * Bot classification is User-Agent based and therefore spoofable, and Google's Gemini and
//     Apple's AI crawl under the shared Googlebot/Applebot UAs — so some crawler traffic lands
//     in the `nonbot` bucket. Treat `nonbot` as a ceiling on human traffic, not a measurement.
//   * Counting happens BEFORE the per-IP rate limiter (see proxy.ts for why), so a request that
//     goes on to be 429'd is still counted. At ~200 req/day against a 60/min limit that is noise.

export type UsageRoute = 'mcp' | 'preflight' | 'ledger';
export type UsageClass = 'nonbot' | 'bot';

// 400d. One full year of history is always readable (the snapshot is monthly and compares
// year-over-year), with a ~5 week margin so a late snapshot never reads a partially-expired
// month. Keys are per-day-per-route-per-class, so the ceiling is 3 x 2 x 400 = 2400 keys.
const KEY_TTL_SECONDS = 400 * 24 * 60 * 60;

// Matches lib/aeoCounter.ts. Upstash's client retries with backoff and sets no per-request
// timeout, so a black-holed connection never settles; without this an Upstash brownout would
// pin every invocation until the platform cap.
const WRITE_TIMEOUT_MS = 5_000;

// Non-AI crawlers that aeoCounter deliberately ignores. It excludes Googlebot/Bingbot on
// purpose — its question is "which LLM vendors fetch us". Here the question is "how much of
// this traffic is a person", so ordinary search and SEO crawlers have to be excluded too.
const GENERIC_BOT_RE =
  /(bot\b|crawler|spider|slurp|crawling|feedfetcher|bingpreview|headlesschrome|python-requests|curl\/|wget\/|go-http-client|node-fetch|axios\/|okhttp|java\/|libwww-perl|scrapy|httpx|monitoring|uptime|pingdom|statuscake|newrelic)/i;

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  _redis =
    url && token
      ? new Redis({ url, token, signal: () => AbortSignal.timeout(WRITE_TIMEOUT_MS) })
      : null;
  return _redis;
}

/**
 * Kill switch. Counting is ON by default — a missing env var must not silently stop the
 * instrument whose entire purpose is to be running. Set API_USAGE_COUNT_DISABLED=1 to stop it
 * without a deploy. Deliberately not routed through lib/flags.ts, which is `import 'server-only'`
 * and would break the build if pulled into the proxy dependency chain (same reasoning as
 * lib/aeoCounter.ts).
 */
function countingDisabled(): boolean {
  return process.env.API_USAGE_COUNT_DISABLED === '1';
}

/** TEST-ONLY seam: override the shared client (mirrors lib/aeoCounter.ts and lib/ratelimit.ts). */
export function __setUsageRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

function dayStamp(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

/** `nonbot` for anything without a recognisable crawler UA. A blank UA counts as a bot: no real
 *  browser omits User-Agent, so an empty one is a script, and mis-filing a script as a human is
 *  the error that matters here. */
export function classifyUsageUa(ua: string | null | undefined): UsageClass {
  if (!ua || !ua.trim()) return 'bot';
  if (classifyAeoBot(ua)) return 'bot';
  return GENERIC_BOT_RE.test(ua) ? 'bot' : 'nonbot';
}

/**
 * The route bucket for a pathname, or null when the path is not one we count.
 *
 * EXACT matches only, and that is load-bearing for /ledger. Next 16 prefetches through segment
 * routes (`/ledger.segments/...`, observed live as `/docs.segments/_tree.segment` etc.), which
 * do not equal `/ledger` and so are excluded for free. That matters because the obvious
 * prefetch filter does NOT work here: per the Next 16 proxy docs (node_modules/next/dist/docs/
 * 01-app/03-api-reference/03-file-conventions/proxy.md, "RSC requests and rewrites"), Next
 * strips `rsc`, `next-router-state-tree` and `next-router-prefetch` from the request instance
 * inside Proxy, so a header check on them would silently never fire. Do not add one.
 */
export function usageRouteFor(pathname: string): UsageRoute | null {
  if (pathname === '/api/mcp') return 'mcp';
  if (pathname === '/api/v1/preflight') return 'preflight';
  if (pathname === '/ledger') return 'ledger';
  return null;
}

/**
 * Record one call. Never throws (fail-open) — counting must never break a response.
 *
 * Pass this to `event.waitUntil(...)` from proxy.ts: the response is already on its way, so the
 * write costs the caller no TTFB, and the platform keeps the isolate alive until it settles
 * rather than dropping it on a post-response freeze.
 */
export async function recordApiCall(
  route: UsageRoute,
  ua: string | null,
): Promise<void> {
  if (countingDisabled()) return;
  const cls = classifyUsageUa(ua);

  // Also emitted to the runtime log. Retention is ~24h, so this is not the durable record —
  // it is the read path while debugging a deploy, and the only trace if Upstash is unconfigured.
  console.log(`API_USAGE route=${route} class=${cls}`);

  try {
    const r = redis();
    if (!r) return;
    const key = `usage:${route}:${cls}:${dayStamp()}`;
    // One pipelined round trip: incr + expire ship together, so a failure can never land
    // BETWEEN them and leave a key with no TTL (which would leak that key forever).
    await r.pipeline().incr(key).expire(key, KEY_TTL_SECONDS).exec();
  } catch {
    // fail-open: the durable counter is best-effort; the console.log above still recorded the hit.
  }
}
