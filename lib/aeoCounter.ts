import { Redis } from '@upstash/redis';

// Bounded-window instrumentation to answer decision (a): do AI crawlers actually fetch
// /llms.txt and /llms-full.txt? Those routes are CDN-cached, so edge-served fetches never
// invoke the function and are invisible to runtime logs. For the measurement window the two
// routes are made dynamic (uncached); this module records AI-bot fetches two ways:
//   1. a structured console.log line — the RELIABLE channel (synchronous, always lands pre-response);
//      readable via Vercel runtime logs (short retention; poll during the window), and
//   2. a durable Upstash counter (bot-family x route x day) — a BEST-EFFORT backstop (fire-and-forget
//      write; may drop if the isolate freezes post-response, self-heals next minute).
// IMPORTANT — the unit of measure is ACTIVE-MINUTES, not raw fetch count. A per-isolate per-minute
// dedup (below) makes BOTH channels emit at most once per (route,family,UTC-minute) per isolate, so a
// flood can't drive volume. Read any nonzero as "this family fetched this route" (presence) — NEVER as
// a fetch-count/volume. This is exactly what decision (a) needs, and the raw count was a spoofable floor
// anyway. Non-bot traffic records nothing. Fail-open everywhere: counting must never break a response.
//
// REVERT CHECKLIST after the window (tasks/todo.md is the canonical copy — keep them in sync):
//   1. app/llms.txt/route.ts       — revalidate 0 -> 3600; Cache-Control no-store -> s-maxage=3600;
//                                     drop the recordAeoFetch call + import.
//   2. app/llms-full.txt/route.ts  — revalidate 0 -> 3600; Cache-Control s-maxage=60 -> 3600; drop the
//                                     recordAeoFetch call + import. KEEP bodyCacheStore (a general win).
//   3. Delete lib/aeoCounter.ts + lib/aeoCounter.test.ts AND remove aeoCounter.test.ts from the
//      package.json `test:lib` glob (else the glob points at a deleted file and test:lib goes red).
//   4. test/routes/llms.test.ts    — remove the aeoCounter import + the 4 counter/HEAD tests, and
//      restore the cache-header assertions to /s-maxage=3600/ on BOTH routes (else test:routes goes red).
//   NOT REVERTED (PERMANENT hardening — do NOT `git checkout HEAD --` these): proxy.ts (llms matcher,
//   routeClass split, query-strip 308), lib/llmsFullCache.ts + its test, and lib/registry.ts (the
//   single-flight snapshot resolve + `return _cache.servers` + the loadSnapshot() warm short-circuit —
//   a general OOM/consistency fix, not AEO-specific). Query-strip protects the re-cached 4MB route at s-maxage=3600.
//   COMMIT SPLIT: land the permanent hardening (proxy*, llmsFullCache*) and the temporary window
//   (route cache configs + recordAeoFetch + aeoCounter* + the llms.test AEO edits + the package.json
//   glob line) as SEPARATE commits, so the window can be `git revert`ed without undoing the hardening.

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

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

/** TEST-ONLY seam: override the shared client (mirrors lib/ratelimit.ts). */
export function __setAeoRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

/** TEST-ONLY seam: clear the per-minute write-dedup so each test starts fresh. */
export function __resetAeoDedupForTest(): void {
  _recentWrites.clear();
}

const KEY_TTL_SECONDS = 120 * 24 * 60 * 60; // 120d — outlives any ~2-week measurement window.
const WRITE_BUDGET_MS = 300; // caps how long the un-awaited (fire-and-forget) write may run before its race resolves.

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
// per minute. Consequence: the durable counter now measures ACTIVE-MINUTES (presence), not raw hits —
// which is exactly what decision (a) needs ("do crawlers fetch this?"), and the raw count was already a
// spoofable floor. `/llms.txt` (no-store) still catches every distinct active minute per family.
const _recentWrites = new Map<string, number>();
const _DEDUP_PRUNE_MS = 120_000;

/**
 * Record a fetch of an AEO route. No-op for non-bot traffic and for a (route,family,minute) already
 * seen on this isolate. Never throws (fail-open). Call it FIRE-AND-FORGET (`void recordAeoFetch(...)`)
 * so it adds zero TTFB: the console.log (reliable) + the Redis pipeline are INITIATED synchronously,
 * only the completion is un-awaited. The isolate may freeze post-response and drop an in-flight write —
 * acceptable: writes are best-effort, per-minute-deduped (a dropped one self-heals next minute), and the
 * synchronous console.log is the reliable primary read path.
 * NOTE: Next's after()/waitUntil would guarantee the write completes, but after() THROWS "called outside
 * a request scope" when a route handler is invoked directly in a unit test — it would break every route
 * test. Fire-and-forget keeps the routes unit-testable; the durable write stays best-effort by design.
 */
export async function recordAeoFetch(route: 'llms' | 'llms-full', ua: string | null): Promise<void> {
  const family = classifyAeoBot(ua);
  if (!family) return;

  const dedupKey = `${route}:${family}:${minuteStamp()}`;
  if (_recentWrites.has(dedupKey)) return; // already recorded this route/family this minute on this isolate
  const now = Date.now();
  _recentWrites.set(dedupKey, now);
  if (_recentWrites.size > 4000) {
    for (const [k, t] of _recentWrites) if (now - t > _DEDUP_PRUNE_MS) _recentWrites.delete(k);
  }

  // Readable-now signal: the route is dynamic during the window, so this lands in runtime logs.
  console.log(`AEO_BOT_FETCH route=${route} family=${family}`);
  try {
    const r = redis();
    if (!r) return;
    const key = `aeo:${route}:${family}:${dayStamp()}`;
    // Single pipelined round trip: incr + expire ship together, so the timeout can never land
    // BETWEEN them (no key left without a TTL) and latency is one RTT, not two. try/catch is
    // fail-open for THROWS; the race is fail-open for a HUNG connection, so a slow Upstash can
    // never delay the crawler's response past ~WRITE_BUDGET_MS (the write still lands when healthy).
    const write = r.pipeline().incr(key).expire(key, KEY_TTL_SECONDS).exec().then(() => {}).catch(() => {});
    let timer: ReturnType<typeof setTimeout>;
    const budget = new Promise<void>((res) => { timer = setTimeout(res, WRITE_BUDGET_MS); });
    await Promise.race([write, budget]);
    clearTimeout(timer!);
  } catch {
    // fail-open: durable counter is best-effort; the console.log above still recorded the hit.
  }
}
