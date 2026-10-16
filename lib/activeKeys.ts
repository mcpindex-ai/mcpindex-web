// Active API keys: the mcpindex north-star metric.
//
// DEFINITION (GB, 2026-10-12), and the only place it lives in code: a key is ACTIVE on date D
// when it made authenticated API calls on at least ACTIVE_MIN_DAYS distinct UTC days inside the
// ACTIVE_WINDOW_DAYS-day window ending on D (D inclusive). The metric is the count of such keys.
// scripts/active-keys.ts prints it; tools/niw-metrics calls that script instead of re-deriving
// the window, so changing either constant here changes every reader.
//
// STORAGE. One Upstash SET per UTC day, `activekeys:v1:YYYYMMDD`, whose members are key ids.
// A key id is sha256(raw key) as lowercase hex: the same value Supabase stores as
// api_keys.key_hash and the Python owner service computes in cse/action_tier_supabase._hash_key.
// Using that id rather than a new one means (a) the VM can write the same buckets with no
// coordination and (b) a later join against api_keys can split self-serve keys from
// operator-minted ones. The raw key is 256 bits of randomness, so the hash is not reversible
// and is not a credential: presenting it authenticates nothing.
//
// RETENTION is 40 days: the 7-day window, plus a 30-day look-back so a month-end snapshot run
// late (launchd misses, the Studio is off) can still read the window ending on the 31st, plus
// 3 days of slack. Storage is 40 small sets; there is no reason to keep less.
//
// COST. Two commands (SADD + EXPIRE, one pipelined round trip) the first time an isolate sees a
// (key, day) pair, zero after that. The per-isolate dedup is safe here because SADD is
// idempotent: skipping a repeat write cannot change the set. (lib/apiUsage.ts must NOT dedup,
// because it counts volume; this counts presence.)
//
// FAIL-OPEN. recordActiveKey never throws and is never awaited on the response path: callers
// schedule it with afterResponse(), which uses next/server `after`. A write that hangs is cut
// off at WRITE_TIMEOUT_MS so it cannot pin an isolate either.

import 'server-only';
import { createHash } from 'node:crypto';
import { after } from 'next/server';
import { Redis } from '@upstash/redis';
import { redisUrl, redisToken } from './env';

export const ACTIVE_WINDOW_DAYS = 7;
export const ACTIVE_MIN_DAYS = 2;
export const BUCKET_TTL_SECONDS = 40 * 24 * 60 * 60;
export const BUCKET_PREFIX = 'activekeys:v1:';

const WRITE_TIMEOUT_MS = 2_000;
// Bounds the per-isolate dedup memory. When full it is cleared, which only costs a few
// redundant (idempotent) writes.
const SEEN_MAX = 5_000;

/** Minimal Upstash surface this module uses, so tests can inject a fake without casts. */
export interface ActiveKeysRedis {
  pipeline(): {
    sadd(key: string, member: string): unknown;
    expire(key: string, seconds: number): unknown;
    smembers(key: string): unknown;
    exec(): Promise<unknown[]>;
  };
}

let _redis: ActiveKeysRedis | null | undefined;
function redis(): ActiveKeysRedis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  // automaticDeserialization off: the members are hex strings, and an all-digit or
  // digits-e-digits id would otherwise come back from SMEMBERS as a JSON number.
  _redis =
    url && token
      ? (new Redis({ url, token, automaticDeserialization: false }) as unknown as ActiveKeysRedis)
      : null;
  return _redis;
}

const seen = new Set<string>();
let writeTimeoutMs = WRITE_TIMEOUT_MS;

/** TEST-ONLY seam. `null` = no client, `undefined` = resolve from env, an object = fake. Also
 *  clears the dedup memory so each test starts cold. */
export function __setActiveKeysRedisForTest(client: ActiveKeysRedis | null | undefined): void {
  _redis = client;
  seen.clear();
}

/** TEST-ONLY seam for the write timeout. */
export function __setActiveKeysWriteTimeoutForTest(ms: number | undefined): void {
  writeTimeoutMs = ms ?? WRITE_TIMEOUT_MS;
}

/** Kill switch, ON by default for the same reason as API_USAGE_COUNT_DISABLED. */
function recordingDisabled(): boolean {
  return process.env.ACTIVE_KEYS_DISABLED === '1';
}

/** sha256(raw key) as lowercase hex. Matches api_keys.key_hash. */
export function keyId(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

/** YYYYMMDD for the UTC day containing `now`. */
export function dayStamp(now: Date): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

export function bucketKey(stamp: string): string {
  return BUCKET_PREFIX + stamp;
}

/** Parse a YYYY-MM-DD date as UTC midnight, or throw. */
function parseDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`bad date: ${date}`);
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
    throw new Error(`bad date: ${date}`);
  }
  return d;
}

/** The ACTIVE_WINDOW_DAYS day stamps ending on `date` (inclusive), oldest first. */
export function windowStamps(date: string, days: number = ACTIVE_WINDOW_DAYS): string[] {
  const end = parseDate(date).getTime();
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayStamp(new Date(end - i * 86_400_000)));
  return out;
}

/** Keys present in at least `minDays` of the given per-day member lists. A key listed twice in
 *  one day's list still counts as one day. */
export function countActive(perDay: string[][], minDays: number = ACTIVE_MIN_DAYS): number {
  const days = new Map<string, number>();
  for (const members of perDay) {
    for (const m of new Set(members)) days.set(m, (days.get(m) ?? 0) + 1);
  }
  let n = 0;
  for (const c of days.values()) if (c >= minDays) n++;
  return n;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('active-keys write timeout')), ms);
    (t as { unref?: () => void }).unref?.();
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Record that `rawKey` made an authenticated call at `now`. Never throws, never rejects.
 * Call it only after the upstream has accepted the key, and only via afterResponse().
 */
export async function recordActiveKey(rawKey: string, now: Date = new Date()): Promise<void> {
  try {
    if (recordingDisabled()) return;
    const r = redis();
    if (!r) return;
    const stamp = dayStamp(now);
    const id = keyId(rawKey);
    const memo = `${stamp}:${id}`;
    if (seen.has(memo)) return;
    const k = bucketKey(stamp);
    // SADD and EXPIRE in one pipeline so a failure cannot land between them and leave a
    // bucket with no TTL.
    const p = r.pipeline();
    p.sadd(k, id);
    p.expire(k, BUCKET_TTL_SECONDS);
    await withTimeout(p.exec(), writeTimeoutMs);
    if (seen.size >= SEEN_MAX) seen.clear();
    seen.add(memo); // only after a successful write, so a failed one is retried next call
  } catch {
    // fail-open: a lost activity mark costs at most one day for one key.
  }
}

// Did the upstream accept the api_key? The owner service authenticates FIRST (cse/owner_api.py
// handle_owner: bearer -> resolve_account_tier -> 401 before anything else), so any 2xx and any
// 4xx except 401 means the key was valid. 404 is excluded too: the upstream answers an unmounted
// path with 404 before it looks at the key. The owner proxy returns early on 3xx and 5xx.
export function upstreamAuthenticated(status: number): boolean {
  if (status >= 200 && status < 300) return true;
  return status >= 400 && status < 500 && status !== 401 && status !== 404;
}

/** Run `task` after the response is sent. Outside a Next request scope (tests, scripts) `after`
 *  throws; fall back to fire-and-forget. Neither path can throw into the caller. */
export function afterResponse(task: () => Promise<void>): void {
  const safe = () => task().catch(() => undefined);
  try {
    after(safe);
  } catch {
    void safe();
  }
}

export interface ActiveKeysReport {
  date: string;
  window_start: string;
  window_end: string;
  window_days: number;
  min_days: number;
  active_keys: number;
  distinct_keys_seen: number;
  /** Days in the window whose bucket is non-empty. An empty day means no recorded activity OR
   *  the counter was not deployed yet; the store cannot tell those apart. */
  days_with_data: number;
}

/** The active-key count for `date` (YYYY-MM-DD, UTC). Throws when Redis is absent or errors:
 *  a read that fails must never look like a real zero. Seven SMEMBERS in one round trip. */
export async function activeKeysOn(
  date: string,
  client: ActiveKeysRedis | null = redis(),
): Promise<ActiveKeysReport> {
  if (!client) throw new Error('no Upstash REST credentials; active keys unread');
  const stamps = windowStamps(date);
  const p = client.pipeline();
  for (const s of stamps) p.smembers(bucketKey(s));
  const results = await p.exec();
  if (!Array.isArray(results) || results.length !== stamps.length) {
    throw new Error('active-keys read returned a malformed result');
  }
  const perDay = results.map((v) => (Array.isArray(v) ? v.map((m) => String(m)) : []));
  const daysWithData = perDay.filter((m) => m.length > 0).length;
  const iso = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return {
    date,
    window_start: iso(stamps[0]!),
    window_end: iso(stamps[stamps.length - 1]!),
    window_days: ACTIVE_WINDOW_DAYS,
    min_days: ACTIVE_MIN_DAYS,
    active_keys: countActive(perDay),
    distinct_keys_seen: new Set(perDay.flat()).size,
    days_with_data: daysWithData,
  };
}
