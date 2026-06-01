// Groq key-pool liveness for the external healthcheck (tools/healthcheck).
//
// The live /screen endpoint fails over primary -> fallback silently; a revoked
// or expired primary key would otherwise degrade the pool to one key with no
// alert until the backup ALSO dies. This endpoint lets the healthcheck probe
// detect a dead key proactively (every 5 min) instead of waiting for /screen
// traffic to surface it in the logs.
//
// Liveness check = GET https://api.groq.com/openai/v1/models with each key.
// That endpoint costs NO tokens: 200 => key live, 401/403 => key dead/revoked,
// anything else => unknown (not a hard fail). Key VALUES are never returned or
// logged - only slot name + boolean.
//
// Abuse-safe: a module-level memo throttles the real Groq calls to at most once
// per TTL per warm instance, so hammering this URL cannot fan out to Groq.

// Pin the render contract the memo throttle assumes: this GET must run at
// request time (it reads env + calls Groq), never be statically cached, so the
// module-level memo stays the throttle of record regardless of future Next
// caching defaults (e.g. Cache Components).
export const dynamic = 'force-dynamic';

const MODELS_URL = 'https://api.groq.com/openai/v1/models';
const TTL_MS = 300_000; // 5 min - matches the healthcheck cadence

type Slot = { slot: 'primary' | 'fallback'; ok: boolean | null };
type Health = { healthy: boolean; pool: Slot[]; checked_at: string };

let memo: { at: number; body: Health } | null = null;

async function keyLive(key: string): Promise<boolean | null> {
  try {
    const res = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 200) return true;
    if (res.status === 401 || res.status === 403) return false; // revoked/expired
    return null; // 429/5xx/etc: transient, not a hard "dead" signal
  } catch {
    return null; // network/timeout: unknown, do not hard-fail on it
  }
}

async function compute(): Promise<Health> {
  const slots: Array<['primary' | 'fallback', string | undefined]> = [
    ['primary', process.env.MCPINDEX_GROQ_API_KEY],
    ['fallback', process.env.MCPINDEX_GROQ_API_KEY_FALLBACK],
  ];
  const configured = slots.filter(([, k]) => typeof k === 'string' && k.length > 0);
  const pool: Slot[] = await Promise.all(
    configured.map(async ([slot, k]) => ({ slot, ok: await keyLive(k as string) })),
  );
  // healthy = at least one key configured AND no configured key is KNOWN-dead.
  // A known-dead key (ok === false) is the alert condition - whether it's the
  // primary (running on backup) or the fallback (redundancy already lost).
  const healthy = configured.length > 0 && !pool.some((p) => p.ok === false);
  return { healthy, pool, checked_at: new Date().toISOString() };
}

export async function GET() {
  const now = Date.now();
  if (!memo || now - memo.at >= TTL_MS) {
    memo = { at: now, body: await compute() };
  }
  // 503 when unhealthy so a plain status probe also catches it; JSON `healthy`
  // is the field the healthcheck asserts.
  return Response.json(memo.body, {
    status: memo.body.healthy ? 200 : 503,
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
