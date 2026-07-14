// Shared harness for API route-handler tests. Drives an app/api/**/route.ts export with a real
// NextRequest and returns the resolved Response already read once (body can only be consumed once).
// Run these suites with:  tsx --conditions=react-server --test 'test/routes/**/*.test.ts'
// (the react-server condition makes `server-only`-importing routes loadable outside the Next runtime.)

import { NextRequest } from 'next/server';

// ctx typed `any` on purpose: route handlers vary — some take only (req), dynamic ones take a
// required `{ params: Promise<…> }`. `any` lets one callRoute accept them all without per-route generics.
type Handler = (req: NextRequest, ctx?: any) => Promise<Response> | Response;

export interface CallOpts {
  method?: string;
  query?: Record<string, string>;
  /** JSON body — serialized + content-type: application/json unless headers override. */
  body?: unknown;
  /** Raw body (form-encoded, pre-serialized). Takes precedence over `body`. */
  raw?: BodyInit;
  headers?: Record<string, string>;
  /** Dynamic-route params. Next 16 passes these as a Promise. */
  params?: Record<string, string>;
  /** Sets x-forwarded-for so per-IP rate-limit keys are stable across a test. */
  ip?: string;
}

export interface CalledResponse {
  status: number;
  headers: Headers;
  /** Body text, already read. */
  text: string;
  /** Parse the (already-read) body as JSON. Throws on non-JSON — assert content-type first. */
  json: () => unknown;
  location: string | null;
}

export async function callRoute(handler: Handler, path: string, opts: CallOpts = {}): Promise<CalledResponse> {
  const method = (opts.method ?? 'GET').toUpperCase();
  const url = new URL(path, 'https://mcpindex.ai');
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

  const headers = new Headers(opts.headers ?? {});
  // Set the PRIMARY header the routes read first (x-vercel-forwarded-for) + the fallback, so the
  // production IP-extraction path is exercised, not just the fallback branch.
  if (opts.ip) {
    headers.set('x-vercel-forwarded-for', opts.ip);
    headers.set('x-forwarded-for', opts.ip);
  }

  let body: BodyInit | undefined;
  if (method !== 'GET' && method !== 'HEAD') {
    if (opts.raw !== undefined) {
      body = opts.raw;
    } else if (opts.body !== undefined) {
      body = JSON.stringify(opts.body);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
  }

  const req = new NextRequest(url, { method, headers, body });
  const ctx = opts.params ? { params: Promise.resolve(opts.params) } : undefined;
  const res = await handler(req, ctx);
  const text = await res.text();
  return {
    status: res.status,
    headers: res.headers,
    text,
    json: () => JSON.parse(text),
    location: res.headers.get('location'),
  };
}

// ---- fixture constants (real, verified against data/verdicts.json + data/snapshot.json) ----
export const FIX = {
  // In BOTH snapshot and verdicts → server/[slug] + badge + trust API can be asserted to agree.
  SCREENED: 'ac-inference-sh-mcp',
  REVIEW: 'ai-dynsoft-sac', // integrity.description fail, adjudication null → badge "review"
  CLEARED: 'io-github-evan-moon-firma', // integrity fail + adjudication "cleared" → badge "screened"
  UNKNOWN: 'does-not-exist', // unknown slug → getVerdict null → UNVERIFIED / gray badge / 404
  FIXTURE: 'fixture--ssh-key-exfil-read-file', // fixture:true → excluded by getVerdict → UNVERIFIED
  // 32-hex / 64-hex validators used across drift/receipts/oauth.
  ID32_OK: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  ID32_BAD: 'not-a-valid-hex-id',
  FP32_OK: '0123456789abcdef0123456789abcdef',
  STATE64_OK: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
} as const;

const GATE_FLAGS = [
  'DRIFT_IDENTITY',
  'DRIFT_OAUTH_UPGRADE',
  'NEXT_PUBLIC_DRIFT_LEDGER',
  'MCPINDEX_LOGIN_ENABLED',
  'CRON_SECRET',
] as const;

// Minimal Upstash-Redis-shaped mock covering the methods the drift/receipt/login libs call.
// Lifted from lib/driftIdentity.test.ts and extended (incr/expire/zadd/pfadd/xadd) so it can back
// more than one module. Methods no-op-return sensible defaults; unimplemented calls throw loudly
// (better a clear failure than a silent wrong branch). Inject via the lib __set*RedisForTest seams.
export function mockRedis(): any {
  const H = new Map<string, Record<string, string>>();
  const S = new Map<string, Set<string>>();
  const K = new Map<string, string>();
  const Z = new Map<string, Map<string, number>>();
  return {
    async hset(key: string, fields: Record<string, string>) { H.set(key, { ...(H.get(key) ?? {}), ...fields }); return 1; },
    async hgetall(key: string) { const r = H.get(key); return r ? { ...r } : null; },
    async hget(key: string, f: string) { return H.get(key)?.[f] ?? null; },
    async sadd(key: string, ...m: string[]) { const s = S.get(key) ?? new Set(); m.forEach((x) => s.add(x)); S.set(key, s); return m.length; },
    async smembers(key: string) { return [...(S.get(key) ?? [])]; },
    async sismember(key: string, m: string) { return S.get(key)?.has(m) ? 1 : 0; },
    async get(key: string) { return K.get(key) ?? null; },
    async set(key: string, v: string) { K.set(key, String(v)); return 'OK'; },
    async getdel(key: string) { const v = K.get(key) ?? null; K.delete(key); return v; },
    async setnx(key: string, v: string) { if (K.has(key)) return 0; K.set(key, String(v)); return 1; },
    async del(key: string) { H.delete(key); S.delete(key); K.delete(key); Z.delete(key); return 1; },
    async incr(key: string) { const n = Number(K.get(key) ?? '0') + 1; K.set(key, String(n)); return n; },
    async expire() { return 1; },
    async zadd(key: string, ...pairs: any[]) { const z = Z.get(key) ?? new Map(); for (const p of pairs) if (p && typeof p === 'object') z.set(p.member, p.score); Z.set(key, z); return 1; },
    async zrange(key: string) { return [...(Z.get(key)?.keys() ?? [])]; },
    async pfadd() { return 1; },
    async pfcount() { return 0; },
    async xadd() { return '1-0'; },
    async xrange() { return []; },
    async eval(_s: string, keys: string[]) { const k = keys[0]; const row = H.get(k); if (row) H.set(k, { ...row, status: 'revoked', github_hash: '' }); return 'ok'; },
    async pipeline() { const ops: any[] = []; const self: any = { }; ['hset','sadd','set','incr','expire','zadd','pfadd','xadd'].forEach((m) => { self[m] = () => { ops.push(m); return self; }; }); self.exec = async () => ops.map(() => 'OK'); return self; },
  };
}

// A Redis mock whose counters are always already over any limit — every ratelimit check that runs
// `incr(key) > LIMIT` (or a zset window) returns over-limit → the route's 429 branch. Inject via
// __setRatelimitRedisForTest. Reads return null/empty so it can't accidentally satisfy other paths.
export function overLimitRedis(): any {
  const HUGE = 10_000_000;
  return {
    async incr() { return HUGE; },
    async expire() { return 1; },
    async zadd() { return 1; },
    async zcard() { return HUGE; },
    async zcount() { return HUGE; },
    async zremrangebyscore() { return 0; },
    async get() { return null; },
    async set() { return 'OK'; },
    async eval() { return HUGE; },
    async pipeline() { const self: any = {}; ['zremrangebyscore', 'zadd', 'zcard', 'expire', 'incr'].forEach((m) => { self[m] = () => self; }); self.exec = async () => [0, 1, HUGE, 1]; return self; },
  };
}

// A Redis mock that actually STORES list entries so a POST→GET round-trip reads its own writes.
// Backs lpush/lrange + a pipeline whose lpush appends on exec() (how recordReceiptBatch writes).
// Everything else no-ops. Inject via a module's __set*RedisForTest seam.
export function storingRedis(): any {
  const lists = new Map<string, string[]>();
  const doLpush = (k: string, vals: string[]) => { const l = lists.get(k) ?? []; l.unshift(...vals); lists.set(k, l); return l.length; };
  const pipeline = () => {
    const ops: Array<() => void> = [];
    const p: any = { exec: async () => { ops.forEach((o) => o()); return ops.map(() => 'OK'); } };
    p.lpush = (k: string, ...v: string[]) => { ops.push(() => doLpush(k, v)); return p; };
    ['xadd', 'expire', 'hset', 'sadd', 'set', 'incr', 'zadd', 'pfadd', 'rpush', 'ltrim', 'del', 'zremrangebyscore', 'pfmerge'].forEach((m) => { p[m] = () => p; });
    return p;
  };
  return {
    pipeline,
    async lrange(k: string, start: number, stop: number) { const l = lists.get(k) ?? []; return l.slice(start, stop === -1 ? undefined : stop + 1); },
    async lpush(k: string, ...v: string[]) { return doLpush(k, v); },
    async xadd() { return '1-0'; },
    async expire() { return 1; },
    async incr() { return 1; },
    async hgetall() { return null; },
    async smembers() { return []; },
    async sismember() { return 0; },
    async get() { return null; },
    async set() { return 'OK'; },
  };
}

/** Snapshot + restore process.env around a test so gate flags never bleed across tests.
 * Use in beforeEach/afterEach: `const restore = snapshotEnv(); ... restore();` */
export function snapshotEnv(): () => void {
  const saved = new Map<string, string | undefined>();
  for (const k of GATE_FLAGS) saved.set(k, process.env[k]);
  // Gate flags default OFF; a test opts in explicitly.
  for (const k of GATE_FLAGS) delete process.env[k];
  return () => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}
