import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import type { NextFetchEvent } from 'next/server';
import { proxy as rawProxy } from '../../proxy';
import { __setAeoRedisForTest, __resetAeoDedupForTest } from '../../lib/aeoCounter';

// The real signature is proxy(req, event). Every test below calls proxy(req) and this wrapper
// supplies a stub NextFetchEvent, collecting whatever was handed to waitUntil so the AEO
// counting tests can await it. Without collecting, a counting assertion would race the write.
let scheduled: Promise<unknown>[] = [];
function proxy(req: NextRequest) {
  const event = {
    waitUntil: (p: Promise<unknown>) => { scheduled.push(p); },
  } as unknown as NextFetchEvent;
  return rawProxy(req, event);
}
/** Settle everything the proxy handed to waitUntil, then hand back how many there were. */
async function drain(): Promise<number> {
  const n = scheduled.length;
  await Promise.all(scheduled);
  scheduled = [];
  return n;
}

afterEach(() => {
  scheduled = [];
  __resetAeoDedupForTest();
});

// The AEO cache-bust guard: a query string on an llms route is collapsed to the canonical
// (cacheable) URL with a tiny 308, so `?_=N` can't defeat the /llms-full.txt s-maxage=3600 shield
// and force a ~5MB origin render per request.
test('proxy: query string on /llms-full.txt → 308 to the canonical URL (cache-bust guard)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/llms-full.txt?_=1'));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://mcpindex.ai/llms-full.txt');
});

test('proxy: query string on /llms.txt → 308 to the canonical URL', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/llms.txt?utm=x&_=2'));
  assert.equal(res.status, 308);
  assert.equal(res.headers.get('location'), 'https://mcpindex.ai/llms.txt');
});

test('proxy: bare llms URL passes through (no redirect loop)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/llms-full.txt'));
  assert.notEqual(res.status, 308);
});

test('proxy: query on a non-llms limited route is NOT query-stripped', () => {
  // /api/v1/* is rate-limited but its query is meaningful (e.g. ?q=), so it must not be redirected.
  const res = proxy(new NextRequest('https://mcpindex.ai/api/v1/search?q=pdf'));
  assert.notEqual(res.status, 308);
});

test('proxy: >60 llms requests/min/IP → 429', () => {
  const headers = { 'x-vercel-forwarded-for': '9.9.9.101' };
  let last;
  for (let i = 0; i < 61; i++) {
    last = proxy(new NextRequest('https://mcpindex.ai/llms-full.txt', { headers }));
  }
  assert.equal(last!.status, 429);
});

test('proxy: exhausting the llms budget does NOT 429 the same IP on /api/v1 (routeClass split)', () => {
  const headers = { 'x-vercel-forwarded-for': '9.9.9.102' };
  for (let i = 0; i < 61; i++) {
    proxy(new NextRequest('https://mcpindex.ai/llms-full.txt', { headers })); // exhaust llms:ip
  }
  const api = proxy(new NextRequest('https://mcpindex.ai/api/v1/search?q=x', { headers }));
  assert.notEqual(api.status, 429, 'api bucket must be independent of the llms bucket');
});

test('proxy: known-gone /server/<slug> → 410 (GSC drop signal)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/server/net-csclear-venue'));
  assert.equal(res.status, 410);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
});

test('proxy: seeded rename /server/<slug> → 308 to successor', () => {
  const res = proxy(
    new NextRequest('https://mcpindex.ai/server/eu-ansvar-eu-regulations-mcp'),
  );
  assert.equal(res.status, 308);
  assert.equal(
    res.headers.get('location'),
    'https://mcpindex.ai/server/eu-ansvar-eu-regulations',
  );
});

test('proxy: live /server/<slug> passes through (no 410/308)', () => {
  const res = proxy(new NextRequest('https://mcpindex.ai/server/eu-ansvar-romanian-law-mcp'));
  assert.notEqual(res.status, 410);
  assert.notEqual(res.status, 308);
});

// ---------------------------------------------------------------------------
// AEO crawler counting. This lives in the proxy, NOT in the route handlers, because a route
// handler only runs on a cache MISS - counting there is what forced `no-store` on both llms
// routes during the 2026-07 window and timed out an external agent-accessibility audit.
// Proxy runs before the CDN cache, so it sees edge-served hits while the routes stay prerendered.
// These tests lock the placement AND the exclusions; a regression here is invisible in prod
// until a fortnight of data turns out to be wrong.
// ---------------------------------------------------------------------------

/** Capture the Redis keys a proxy call records, proving the wiring and the exact key shape. */
function captureRedis() {
  const keys: string[] = [];
  const pipe = {
    incr(k: string) { keys.push(k); return pipe; },
    expire() { return pipe; },
    exec() { return Promise.resolve([]); },
  };
  return { client: { pipeline: () => pipe }, keys };
}

async function recordedKeys(req: NextRequest): Promise<string[]> {
  const cap = captureRedis();
  __setAeoRedisForTest(cap.client as never);
  try {
    proxy(req);
    await drain();
  } finally {
    __setAeoRedisForTest(null);
  }
  return cap.keys;
}

// Every call gets its OWN x-vercel-forwarded-for. `buckets` in proxy.ts is module-level with no
// reset seam and the whole file runs inside one 60s window, so any test that omits the header
// draws down a single shared `llms:unknown` budget. That is fine at today's count and silently
// fatal later: cross a cumulative 60 and earlier tests start 429ing for no visible reason. A
// distinct IP per call makes each test independent no matter how many get added.
let _ipSeq = 0;
const bot = (ua: string) => ({
  'user-agent': ua,
  'x-vercel-forwarded-for': `198.51.100.${(_ipSeq++ % 250) + 1}`,
});

test('proxy: a bot GET on /llms.txt records aeo:llms:<family>:<day>', async () => {
  const keys = await recordedKeys(
    new NextRequest('https://mcpindex.ai/llms.txt', { headers: bot('GPTBot/1.2') }),
  );
  assert.equal(keys.length, 1, 'proxy did not record the bot fetch');
  assert.match(keys[0]!, /^aeo:llms:openai:\d{8}$/);
});

test('proxy: a bot GET on /llms-full.txt records under the llms-full route key', async () => {
  const keys = await recordedKeys(
    new NextRequest('https://mcpindex.ai/llms-full.txt', { headers: bot('ClaudeBot/1.0') }),
  );
  assert.equal(keys.length, 1);
  assert.match(keys[0]!, /^aeo:llms-full:anthropic:\d{8}$/);
});

test('proxy: a non-bot UA records nothing', async () => {
  const keys = await recordedKeys(
    new NextRequest('https://mcpindex.ai/llms.txt', { headers: bot('Mozilla/5.0 (test-suite)') }),
  );
  assert.equal(keys.length, 0, 'browser traffic must not be counted');
});

test('proxy: a HEAD probe is NOT counted (Next auto-implements HEAD from GET)', async () => {
  const keys = await recordedKeys(
    new NextRequest('https://mcpindex.ai/llms.txt', { method: 'HEAD', headers: bot('GPTBot/1.2') }),
  );
  assert.equal(keys.length, 0, 'HEAD must not double-count a HEAD-then-GET crawler');
});

test('proxy: a query-stripped 308 is NOT counted (the canonical retry is)', async () => {
  const keys = await recordedKeys(
    new NextRequest('https://mcpindex.ai/llms.txt?_=1', { headers: bot('GPTBot/1.2') }),
  );
  assert.equal(keys.length, 0, 'the 308 returns before counting; the crawler re-requests the bare URL');
});

test('proxy: a rate-limited request is NOT counted', async () => {
  // Order matters: this test needs ONE stable IP across all 62 calls, so the explicit address must
  // come after the spread and override the per-call address bot() would otherwise supply.
  const headers = { ...bot('PerplexityBot/1.0'), 'x-vercel-forwarded-for': '203.0.113.77' };
  // Exhaust the llms bucket for this IP. 60/min is the ceiling, so 61 requests trips it.
  for (let i = 0; i < 61; i++) {
    proxy(new NextRequest('https://mcpindex.ai/llms.txt', { headers }));
  }
  await drain();
  __resetAeoDedupForTest();

  const cap = captureRedis();
  __setAeoRedisForTest(cap.client as never);
  try {
    const res = proxy(new NextRequest('https://mcpindex.ai/llms.txt', { headers }));
    assert.equal(res.status, 429, 'precondition: this request must actually be rate-limited');
    await drain();
  } finally {
    __setAeoRedisForTest(null);
  }
  assert.equal(cap.keys.length, 0, 'a 429 returns before counting - a blocked fetch is not a fetch');
});

test('proxy: counting is deduped per (route,family,minute) on one isolate', async () => {
  const cap = captureRedis();
  __setAeoRedisForTest(cap.client as never);
  try {
    for (let i = 0; i < 5; i++) {
      proxy(new NextRequest('https://mcpindex.ai/llms.txt', { headers: bot('Amazonbot/0.1') }));
    }
    await drain();
  } finally {
    __setAeoRedisForTest(null);
  }
  assert.equal(cap.keys.length, 1, 'five fetches in one minute must record once (isolate-minutes, not hits)');
});

test('proxy: the write is deferred to waitUntil, not awaited inline', async () => {
  // Deliberately NOT named "a hung Upstash cannot delay the response". A synchronous `proxy` with a
  // stub waitUntil returns a truthy response no matter what Upstash does, so no assertion here can
  // establish a latency property - asserting one would be theatre. What this DOES prove is the
  // mechanism that gives us that property: the write is handed to waitUntil while still in flight
  // rather than awaited in the request path. An `await recordAeoFetch(...)` regression drops
  // scheduled.length to 0 and fails. The real bound on a hung write is WRITE_TIMEOUT_MS in
  // lib/aeoCounter.ts, covered by its own suite.
  let release!: () => void;
  const hung = new Promise<void>((r) => { release = r; });
  const keys: string[] = [];
  const pipe = {
    incr(k: string) { keys.push(k); return pipe; },
    expire() { return pipe; },
    exec: () => hung,
  };
  __setAeoRedisForTest({ pipeline: () => pipe } as never);
  try {
    proxy(new NextRequest('https://mcpindex.ai/llms.txt', { headers: bot('GPTBot/1.2') }));
    // Scheduled while exec() is still outstanding and will never settle on its own.
    assert.equal(scheduled.length, 1, 'exactly one in-flight promise must be handed to waitUntil');
    release();
    const n = await drain();
    assert.equal(n, 1);
    assert.equal(keys.length, 1, 'and the write still lands once Upstash responds');
  } finally {
    __setAeoRedisForTest(null);
  }
});

test('proxy: an Upstash THROW is swallowed - counting is fail-open', async () => {
  __setAeoRedisForTest({
    pipeline: () => { throw new Error('upstash exploded'); },
  } as never);
  try {
    const res = proxy(new NextRequest('https://mcpindex.ai/llms.txt', { headers: bot('GPTBot/1.2') }));
    assert.ok(res, 'a counting failure must never break the response');
    await drain(); // must not reject
  } finally {
    __setAeoRedisForTest(null);
  }
});
