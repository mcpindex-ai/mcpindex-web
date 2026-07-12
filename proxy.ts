import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

export function proxy(req: NextRequest) {
  // Defense-in-depth, NOT dead code: Next 16 invokes proxy for every route,
  // gated only by `config.matcher`, and the docs warn that a matcher change or
  // refactor can silently broaden coverage (node_modules/next/dist/docs/.../
  // proxy.md, "Execution order"). This in-function path check guarantees we
  // only rate-limit the intended surfaces even if the matcher is later widened -
  // per Next's "verify inside, don't rely on the matcher alone" guidance. Keep it.
  // Rate-limited surfaces: public /api/v1/*; lead forms (/api/waitlist,
  // /api/enterprise); /api/beacon; /api/health/* (outbound liveness).
  const p = req.nextUrl.pathname;
  if (
    !p.startsWith('/api/v1/') &&
    p !== '/api/waitlist' &&
    p !== '/api/enterprise' &&
    p !== '/api/beacon' &&
    !p.startsWith('/api/health/')
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

  const now = Date.now();
  sweepBuckets(now);
  const b = buckets.get(ip);
  if (!b || now - b.windowStart > WINDOW_MS || now < b.windowStart) {
    buckets.set(ip, { count: 1, windowStart: now });
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
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/v1/:path*', '/api/waitlist', '/api/enterprise', '/api/beacon', '/api/health/:path*'],
};
