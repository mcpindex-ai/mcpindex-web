import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Per-IP rate limit on /api/v1/*. Sliding window in-memory map (per-instance).
// Production-grade limit should use Upstash Redis — this is good enough for
// launch traffic and protects the OpenAI bill if/when embeddings ship.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith('/api/v1/')) {
    return NextResponse.next();
  }
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(ip, { count: 1, windowStart: now });
  } else {
    b.count++;
    if (b.count > MAX_PER_WINDOW) {
      return new NextResponse(
        JSON.stringify({
          error: 'rate_limited',
          message: `60 req/min/IP. Email hello@mcpindex.ai for higher limits.`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((WINDOW_MS - (now - b.windowStart)) / 1000)),
          },
        },
      );
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/v1/:path*'],
};
