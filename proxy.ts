import { NextResponse } from 'next/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import {
  getSeededRedirect,
  goneHtml,
  isGoneSlug,
} from '@/lib/serverRemovals';
import { recordAeoFetch } from '@/lib/aeoCounter';
import { recordApiCall, usageRouteFor } from '@/lib/apiUsage';

// Per-IP rate limit on /api/v1/*. Sliding window in-memory map (per-instance).
// Production-grade limit should use Upstash Redis - this is good enough for
// launch traffic and protects the OpenAI bill if/when embeddings ship.
//
// IP trust depends on Vercel's edge stripping client-supplied x-vercel-*
// headers before invoking the function. Hardening preview/raw *.vercel.app
// URLs with Deployment Protection is the platform-level complement to this
// code; tracked separately.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const MAX_BUCKETS = 10_000;
const SWEEP_INTERVAL_MS = 10_000;
const STALE_MS = 2 * WINDOW_MS;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweepBuckets(now: number) {
  if (now < lastSweep) lastSweep = now; // clock regression clamp
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  const cutoff = now - STALE_MS;
  for (const [ip, b] of buckets) {
    if (b.windowStart < cutoff) buckets.delete(ip);
  }
  if (buckets.size > MAX_BUCKETS) {
    // Map iteration is insertion-ordered; evict oldest insertions.
    // Sorting by windowStart would let an attacker spraying fresh IPs
    // evict legitimate users (their windowStart is earlier than the spray).
    const drop = buckets.size - MAX_BUCKETS;
    const it = buckets.keys();
    for (let i = 0; i < drop; i++) {
      const k = it.next().value;
      if (k === undefined) break;
      buckets.delete(k);
    }
  }
}

function serverSlugFromPath(pathname: string): string | null {
  const m = /^\/server\/([^/]+)\/?$/.exec(pathname);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return m[1]!;
  }
}

export function proxy(req: NextRequest, event: NextFetchEvent) {
  const p = req.nextUrl.pathname;

  // SEO: former /server/<slug> URLs that left the registry. Answer before RSC so
  // crawlers see a real 410/308 instead of a soft-404 HTML page. Seeded map only
  // (no registry I/O on the edge) — dynamic alias resolution stays in the page.
  const serverSlug = serverSlugFromPath(p);
  if (serverSlug) {
    const dest = getSeededRedirect(serverSlug);
    if (dest) {
      const url = req.nextUrl.clone();
      url.pathname = `/server/${dest}`;
      return NextResponse.redirect(url, 308);
    }
    if (isGoneSlug(serverSlug)) {
      return new NextResponse(goneHtml(serverSlug), {
        status: 410,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }
  }

  // Durable usage counting for the three surfaces the monthly metrics snapshot reports.
  // Vercel runtime-log retention here is ~24h and the logs API answers `since=30d` with 24h of
  // data without erroring, so nothing durable was recording these. See lib/apiUsage.ts.
  //
  // PLACED BEFORE the rate-limit early-return below, on purpose. Everything after that return
  // is reachable only for paths on the rate-limit allowlist, so counting down there would mean
  // adding /ledger to that allowlist — putting a public content page under the 60/min per-IP
  // limiter and letting it start returning 429s. Degrading a page to make a metric convenient
  // is the wrong trade. The cost of counting here instead: a request that goes on to be 429'd
  // is still counted (aeoCounter, which sits after the limiter, excludes them). At ~200 req/day
  // against a 60/min limit that is noise, and the generated snapshot states it.
  //
  // HEAD is skipped because Next auto-implements HEAD from GET, so a client that HEADs then GETs
  // would count twice. OPTIONS is a CORS preflight, not a call.
  const usageRoute = usageRouteFor(p);
  if (usageRoute && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    event.waitUntil(
      recordApiCall(usageRoute, req.headers.get('user-agent'))
        .catch((e) => console.error('API_USAGE_ERR', e)),
    );
  }

  // Defense-in-depth, NOT dead code: Next 16 invokes proxy for every route,
  // gated only by `config.matcher`, and the docs warn that a matcher change or
  // refactor can silently broaden coverage (node_modules/next/dist/docs/.../
  // proxy.md, "Execution order"). This in-function path check guarantees we
  // only rate-limit the intended surfaces even if the matcher is later widened -
  // per Next's "verify inside, don't rely on the matcher alone" guidance. Keep it.
  // Rate-limited surfaces: public /api/v1/*; lead forms (/api/waitlist,
  // /api/enterprise); /api/beacon; /api/health/* (outbound liveness);
  // /.well-known/mcpindex-challenge (unauthenticated, uncached, one Redis GET per hit);
  // /api/mcp (the hosted remote-MCP endpoint - unauthenticated, and one compare_servers
  // call fans out 5 upstream /api/v1 fetches, so it is the highest-amplification surface
  // we expose. It sat OUTSIDE this matcher entirely until 2026-07-21 and carries no
  // Upstash limiter of its own, unlike /api/owner/* and /api/auth/login/start).
  if (
    !p.startsWith('/api/v1/') &&
    p !== '/api/waitlist' &&
    p !== '/api/enterprise' &&
    p !== '/api/beacon' &&
    !p.startsWith('/api/health/') &&
    p !== '/.well-known/mcpindex-challenge' &&
    p !== '/api/mcp' &&
    // PERMANENT, not tied to any measurement window, and load-bearing for TWO reasons:
    //   1. DoS. /llms.txt and /llms-full.txt are edge-cached, but a cache-busting query forces an
    //      origin render of a ~5MB body. Keep them under the per-IP limit so a cache-MISS flood
    //      stays capped; the query-strip 308 below is the other half of that defense.
    //   2. AEO counting. These two exceptions are the ONLY reason the llms paths fall through to
    //      the bottom of this function, where the crawler counter lives. Delete either line and the
    //      early return below fires and counting silently stops.
    // Removing either one re-opens the origin to a bandwidth-DoS tail AND blinds the counter.
    p !== '/llms.txt' &&
    p !== '/llms-full.txt'
  ) {
    return NextResponse.next();
  }

  // Vercel signs x-vercel-forwarded-for; raw x-forwarded-for is attacker-
  // controlled and can be used to bypass the limit or poison legit buckets.
  const ip =
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  // Namespace the limit bucket by route class so /llms.* does NOT deplete
  // the same per-IP budget as /api/v1/* (a client pulling /llms-full.txt must not 429 its own
  // /api/v1/search). Coarse two-class split keeps the map bounded.
  // `mcp` is its own class so one agent driving the remote-MCP endpoint cannot exhaust the
  // /api/v1 budget for browser/API users on the same instance (and vice versa).
  // KNOWN, DELIBERATELY NOT FIXED HERE: the /api/mcp handler self-fetches API_BASE
  // (https://mcpindex.ai/api/v1/...), so those re-entrant hops arrive from the shared Vercel
  // EGRESS ip and all land in one `api:<egress-ip>` bucket. Bucketing them by User-Agent
  // would be an evasion hole (spoof the UA, get a private bucket), so the real fix is to call
  // the libs in-process instead of over HTTP - a refactor of the 5 `api()` call sites, out of
  // scope for a rate-limit change on a live public endpoint. Tracked in the audit doc.
  const routeClass =
    p === '/llms.txt' || p === '/llms-full.txt'
      ? 'llms'
      : p === '/.well-known/mcpindex-challenge'
        ? 'wellknown'
        : p === '/api/mcp'
          ? 'mcp'
          : 'api';
  const bucketKey = `${routeClass}:${ip}`;

  const now = Date.now();
  sweepBuckets(now);
  const b = buckets.get(bucketKey);
  if (!b || now - b.windowStart > WINDOW_MS || now < b.windowStart) {
    buckets.set(bucketKey, { count: 1, windowStart: now });
  } else {
    b.count++;
    if (b.count > MAX_PER_WINDOW) {
      const retry = Math.max(1, Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000));
      return new NextResponse(
        JSON.stringify({
          error: 'rate_limited',
          message: `60 req/min/IP. Email hello@mcpindex.ai for higher limits.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(retry),
          },
        },
      );
    }
  }

  // Cache-bust guard (after the per-IP limit, so a ?_=N flood is also rate-capped): /llms-full.txt
  // is a ~4MB body edge-cached, but a distinct query string is a distinct CDN cache key -> forces a
  // MISS + full 4MB origin render every request, defeating s-maxage. Collapse any query on the llms
  // routes to the canonical (cacheable) URL with a tiny 308 so s-maxage actually bounds origin egress.
  // Legit crawlers fetch the bare URL and never see this. PERMANENT (not part of the AEO-window
  // revert): it protects the re-cached 4MB route from `?_=N` busting even at s-maxage=3600.
  if ((p === '/llms.txt' || p === '/llms-full.txt') && req.nextUrl.search) {
    const clean = new URL(req.url);
    clean.search = '';
    return NextResponse.redirect(clean, 308);
  }

  // AI-crawler counting. Deliberately LAST, so it records only requests that actually reach the
  // content: a 429 and a query-strip 308 both return above and are not counted. A blocked fetch is
  // not a fetch, and the retired route-handler counter behaved the same way (both also returned
  // before the handler), so the exclusions carry over unchanged.
  //
  // Counting HERE rather than in the route handler is the point: proxy runs before the CDN cache,
  // so this sees edge-served hits while both routes stay prerendered. See lib/aeoCounter.ts for
  // why the previous placement forced `no-store` and what that cost.
  //
  // GET only: Next auto-implements HEAD from GET, so counting HEAD would double-count a crawler
  // that HEADs-then-GETs. waitUntil keeps the isolate alive for the write without delaying the
  // response. recordAeoFetch does not reject today; the catch logs rather than swallows so that if
  // one is ever introduced it surfaces instead of vanishing into an ignored promise.
  if (req.method === 'GET' && (p === '/llms.txt' || p === '/llms-full.txt')) {
    const route = p === '/llms.txt' ? 'llms' : 'llms-full';
    event.waitUntil(
      recordAeoFetch(route, req.headers.get('user-agent'))
        .catch((e) => console.error('AEO_COUNT_ERR', e)),
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/server/:slug',
    '/api/v1/:path*',
    '/api/waitlist',
    '/api/enterprise',
    '/api/beacon',
    '/api/health/:path*',
    '/llms.txt',
    '/llms-full.txt',
    '/.well-known/mcpindex-challenge',
    '/api/mcp',
    // NOT rate-limited — /ledger is here purely so proxy runs for it and lib/apiUsage can count
    // page views. The in-function allowlist above deliberately omits it, so it falls straight
    // through `NextResponse.next()` with no limiter and no behaviour change. Removing this line
    // silently stops ledger counting; the in-function usage block is the other half.
    '/ledger',
  ],
};
