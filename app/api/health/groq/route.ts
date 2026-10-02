// Groq key-pool liveness plus the screen model's chat path.
//
// The live /screen endpoint fails over primary then fallback. A revoked
// primary would otherwise degrade the pool to one key with no alert until
// the backup also dies. GET /openai/v1/models costs no tokens and catches a
// dead key. It stays green when the key is live but the screen model is
// gone (llama-3.3-70b-versatile returned 404 while this check stayed 200).
// One extra chat completion, same model and JSON request shape as
// lib/screen.ts, capped at PROBE_MAX_TOKENS, runs at most once per TTL per
// warm instance. A retired model or a rejected request shape turns this
// red. A 429, 5xx, or timeout stays unknown so a Groq blip does not page.
//
// Key values are never returned or logged. Only slot name, model id, and
// the probe status.

import { GROQ_CHAT_URL, MODEL, buildScreenChatBody } from '@/lib/screen';

// Pin the render contract the memo throttle assumes: this GET must run at
// request time (it reads env + calls Groq), never be statically cached, so the
// module-level memo stays the throttle of record regardless of future Next
// caching defaults (e.g. Cache Components).
export const dynamic = 'force-dynamic';

const MODELS_URL = 'https://api.groq.com/openai/v1/models';
const TTL_MS = 300_000; // 5 min - matches the healthcheck cadence
// Floor on 2026-10-02 was 64 completion tokens for this ping (reasoning
// before the JSON). 32 came back json_validate_failed. 128 leaves headroom
// so a slightly longer trace does not page while the uncapped screen still works.
const PROBE_MAX_TOKENS = 128;
const PROBE_SYSTEM = 'Reply ONLY compact JSON.';
const PROBE_USER = 'Reply {"ok":true}';

type Slot = { slot: 'primary' | 'fallback'; ok: boolean | null };
type Health = {
  healthy: boolean;
  pool: Slot[];
  model: { id: string; ok: boolean | null };
  checked_at: string;
};

let memo: { at: number; body: Health } | null = null;
let _fetch: typeof fetch | undefined;
let _modelForTest: string | undefined;

export function __setGroqHealthFetchForTest(f: typeof fetch | undefined): void {
  _fetch = f;
}
export function __setGroqHealthModelForTest(id: string | undefined): void {
  _modelForTest = id;
}
export function __resetGroqHealthForTest(): void {
  memo = null;
}

// 200: the screen shape works. 429 and 5xx: transient, not a dead model.
// Any other status (404 retired, 400 bad shape, 401/403 chat rejected)
// means /screen would fail closed, so the probe is red.
export function screenProbeOk(status: number): boolean | null {
  if (status === 200) return true;
  if (status === 429 || status >= 500) return null;
  return false;
}

async function keyLive(key: string): Promise<boolean | null> {
  try {
    const res = await (_fetch ?? fetch)(MODELS_URL, {
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

async function modelServes(key: string, modelId: string): Promise<boolean | null> {
  try {
    const res = await (_fetch ?? fetch)(GROQ_CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(
        buildScreenChatBody(PROBE_USER, {
          maxTokens: PROBE_MAX_TOKENS,
          system: PROBE_SYSTEM,
          model: modelId,
        }),
      ),
      signal: AbortSignal.timeout(8_000),
    });
    const ok = screenProbeOk(res.status);
    if (ok === false) {
      console.error(`[groq-health] screen model ${modelId} probe failed status=${res.status}`);
    }
    return ok;
  } catch {
    return null;
  }
}

async function compute(): Promise<Health> {
  const modelId = _modelForTest ?? MODEL;
  const slots: Array<['primary' | 'fallback', string | undefined]> = [
    ['primary', process.env.MCPINDEX_GROQ_API_KEY],
    ['fallback', process.env.MCPINDEX_GROQ_API_KEY_FALLBACK],
  ];
  const configured = slots.filter(([, k]) => typeof k === 'string' && k.length > 0);
  const pool: Slot[] = await Promise.all(
    configured.map(async ([slot, k]) => ({ slot, ok: await keyLive(k as string) })),
  );
  // One chat probe per TTL, on the first key that listed models. A known-dead
  // key is already an alert; do not spend a completion on it.
  const live = pool.find((p) => p.ok === true);
  const liveKey = live
    ? (configured.find(([slot]) => slot === live.slot)?.[1] as string)
    : undefined;
  const modelOk = liveKey ? await modelServes(liveKey, modelId) : null;
  // healthy = at least one key configured AND no configured key is KNOWN-dead
  // AND the screen model was not KNOWN-unreachable. A null model probe
  // (no live key yet, or a transient chat error) does not by itself go red.
  const keysHealthy = configured.length > 0 && !pool.some((p) => p.ok === false);
  const healthy = keysHealthy && modelOk !== false;
  return { healthy, pool, model: { id: modelId, ok: modelOk }, checked_at: new Date().toISOString() };
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
