# Incident investigation — usage spike (2026-08-03 ~06:00 UTC)

**Alert:** Medium severity, 3 anomalies on `mcpindex-web` (Vercel project
`prj_Ot6xYeIR6IZ4a691r009UFHWZ9jD`, team `gautamgb-3642s-projects`):

| Metric | Baseline (avg/5min, 7d) | Spike (last 5min) | Factor | Started |
|---|---|---|---|---|
| Edge Requests | 143 | 3.2k | 22× | 06:00 UTC |
| Function Invocations | 137 | 4.1k | 30× | 06:05 UTC |
| Function CPU Duration | ~0 h | 0.02 h | 11× | 06:05 UTC |

## Verdict

**Benign but uncapped crawler/agent load — not an attack, not a code
regression, not an error loop.** A large-scale sweep of the long-tail
`/server/<slug>` corpus (plus the client-tool pages and the hosted MCP
endpoint) is hitting surfaces that cannot be served from the edge cache, so
each hit becomes a per-request function render. The billable pressure is
**request/invocation count**, not CPU — absolute CPU is trivial
(0.02 CPU-h per 5 min ≈ 0.24 CPU-h/h).

## Evidence (runtime logs, 3h window ending ~06:18 UTC)

- **All successful.** Status codes: `200` **26,124**, `304` 124, `202` 48,
  `400` 37, `405` 6, `410` 1, `504` 1. No 5xx storm, no retry loop.
  `get_runtime_errors` returned only 3 stale, single-occurrence MCP-timeout
  groups on `/api/[transport]`, unrelated to the volume.
- **Source split:** `cache` 21,529 · `function` 6,724 · `middleware` 4,414 ·
  `rewrite` 47. The *function* leg is what is being billed.
- **Top function routes:** `/server/[slug]` **1,733**, `/search` **1,508**,
  `/scan` **1,507**, then ~750 each of the Next-16 `.segments` prefetch routes
  for `/install`, `/docs`, `/`, `/leaderboard`, `/methodology`;
  `/api/v1/server-drift` 630.
- **Request pattern:** systematic walk of server slugs (`GET`/`HEAD /server/…`),
  overwhelmingly `cache=MISS`, interleaved with `POST /api/mcp` tagged
  `class=nonbot`. The `.segments` prefetch volume implies a **JS-executing
  (headless-browser) client** triggering Next's client-side link prefetch —
  i.e. an aggressive scraper/AI crawler, not a plain `GET`-only bot.

The log window (~26.3k requests / 3h ≈ 3.2k/5min edge requests) matches the
dashboard figure, confirming the spike is current and ongoing.

## Root cause (why these requests cost functions)

This is architectural and already documented in-tree; the spike is the
long-standing cost structure meeting a burst of crawler volume.

1. **Only the top 1,500 of ~19.7k server pages are prerendered** —
   `PRERENDER_TOP_N = 1500` (`app/server/[slug]/page.tsx:100`). The other
   ~18k are ISR; the first crawl of each is a cold function render
   (`cache=MISS`).
2. **Bot User-Agents force a dynamic function render even for prerendered
   pages** — `app/server/[slug]/page.tsx:81-99` documents that Next sets
   `supportsDynamicResponse: !botType`, so the prerender store never shields
   crawler traffic, and a crawl does not populate the edge cache. *This is the
   key constraint:* it is why the 1,500→6,000 prerender bump was reverted on
   2026-08-02, and it is why no static/caching change reduces bot-driven load.
3. **`/search` and `/scan` are inherently per-request** — `/search` awaits
   `searchParams` (`app/search/page.tsx`), `/scan` reads `loadLedger()` live
   (`app/scan/page.tsx`, `revalidate = 300` but bot-forced dynamic). Both
   render on every crawl.
4. **`/server/:slug` is deliberately exempt from the per-IP rate limiter** —
   `proxy.ts:123-143` (the matcher includes it only for 308/410 handling); the
   exemption is intentional (do not 429 Googlebot). Nothing throttles a tail
   sweep.
5. **`/api/mcp` amplifies ~5×** — `proxy.ts:158-163`: one `compare_servers`
   call fans out 5 self-`fetch`es to `/api/v1/*` from the shared egress IP.
   538 MCP POSTs → thousands of amplified internal invocations.

Net: `spike = crawler volume × cache-bypassing surfaces × no tail rate limit ×
MCP 5× fan-out`.

## Not determinable from the current tooling

The runtime-logs API exposes only aggregate groupings (no client IP or
User-Agent), and Web Analytics is disabled on the project (404). So the exact
crawler — and whether it is one source or many — could not be identified from
logs. **Vercel dashboard → Firewall (traffic by IP/UA) or Observability** will
show this directly and is the right next step.

## Recommendations (ranked; tradeoffs against the documented SEO strategy)

1. **Identify the source first (no code, no SEO cost).** In Firewall /
   Observability, group live traffic by IP and User-Agent.
   - *If a single abusive scraper:* block or challenge it at the Firewall.
     Resolves the spike without touching application behavior.
   - *If a legitimate search/AI crawler:* this is the expected cost of an open
     ~19.7k-page corpus. Absolute CPU is trivial; consider managing crawl rate
     via Google Search Console / a `Crawl-delay` for non-critical bots and
     accept it, rather than degrading crawlability.
2. **Reduce MCP amplification.** Make `/api/mcp`'s `compare_servers` call the
   libs in-process instead of self-`fetch`ing `/api/v1/*` (5→1). Real
   reduction on that surface, no SEO impact. Already tracked as deferred
   (`proxy.ts:158-163`); medium effort, live-endpoint risk.
3. **Do NOT rate-limit `/server/[slug]` for bots.** This contradicts a
   deliberate, documented decision (crawl budget). Revisit only if cost becomes
   material.
4. **Skip static/caching changes on `/search` and `/scan` as a spike fix.**
   Bot-forced dynamic rendering means they would not reduce this load; they
   only help human traffic.

## Severity assessment

Low operational impact: 100% success responses, no user-facing errors, trivial
absolute CPU. The concern is quota/billing from invocation and edge-request
**count**. No emergency action required; recommend confirming the source
(step 1) before any code change, since every mitigation here trades against the
crawlability the tail pages exist to provide.

## Resolution & source attribution (closed 2026-08-03)

**Spike over.** Live re-check at ~09:00 UTC: ~631 requests / 15 min
(~210 per 5 min; function invocations ~69 per 5 min — below the 7-day
baseline of 137). Status codes clean (378×200, single-digit 4xx). The
sweep ran only the 06:00–06:15 UTC window and did not recur.

**Source identified via Firewall → Traffic (dashboard screenshot).**
A single AWS-hosted headless-browser crawler farm:

- Top IPs: 54.174.58.235 (8.5k), .247 (5.0k), .240 (4.9k), .227 (3.9k)
  — one tight AWS block; top AS = Amazon.com, Inc. at 28.6k requests.
- Top User-Agent: generic `Mozilla/5.0 AppleWebKit/537.36` (Chrome-like,
  24.4k) — consistent with the JS-executing scraper the `.segments`
  prefetch traffic implied. SemrushBot present but minor (~1.7k).
- Firewall verdicts for the window: 23.9k allowed, 698 bypass (Agent
  Surfaces rule), 13 DDoS-mitigation denies. Bot Protection is Inactive.

**Disposition:** no action taken. One-time corpus sweep, self-resolved,
trivial cost. If the same 54.174.58.x block returns at volume, a
Firewall IP/JA4 rule (deny or challenge) resolves it with no code and
no SEO cost — the JA4 digests in the dashboard identify the client even
if IPs rotate. Recommendation 2 (MCP in-process fan-out) remains the
one durable cost reduction and is still deferred.
