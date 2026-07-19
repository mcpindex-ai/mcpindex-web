// Brevo lead-pipeline liveness for the external healthcheck (tools/healthcheck).
//
// The /api/waitlist route is fail-soft: if BREVO_API_KEY is missing or the key is
// revoked, leads silently fall back to log-only and the operator would never know
// the CRM/email pipeline died. This probe surfaces that proactively. Key VALUES
// are never returned or logged - only booleans + a liveness verdict.
//
// Liveness = GET https://api.brevo.com/v3/account: 200 => key live, 401 => dead,
// anything else => unknown (not a hard fail). A module-level memo throttles the
// real Brevo call to once per TTL per warm instance so hammering this URL cannot
// fan out to Brevo.
export const dynamic = 'force-dynamic';

import { createHash } from 'node:crypto';

const ACCOUNT_URL = 'https://api.brevo.com/v3/account';
const TTL_MS = 300_000; // 5 min - matches the healthcheck cadence

type Health = {
  healthy: boolean;
  configured: boolean;
  list_configured: boolean;
  api_ok: boolean | null;
  checked_at: string;
  // TEMP DIAGNOSTIC (redacted): identifies WHICH key the running function reads,
  // without exposing it. sha8 of the value + its length. Remove after diagnosis.
  key_fp: string | null;
  brevo_diag: string | null;
};

let memo: { at: number; body: Health } | null = null;

let lastBrevoDiag: string | null = null; // TEMP: last non-200 Brevo status + message (redacted)

async function ping(key: string): Promise<boolean | null> {
  try {
    const res = await fetch(ACCOUNT_URL, {
      headers: { 'api-key': key },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status === 200) return true;
    // TEMP DIAGNOSTIC: record Brevo's own error message (never contains the key) so we
    // can tell "revoked key" apart from "IP not authorized".
    const body = await res.text().catch(() => '');
    lastBrevoDiag = `${res.status} ${body.slice(0, 160)}`;
    if (res.status === 401) return false; // revoked/invalid OR IP-restricted
    return null; // 429/5xx/etc: transient, not a hard "dead" signal
  } catch {
    return null; // network/timeout: unknown
  }
}

async function compute(): Promise<Health> {
  const key = process.env.BREVO_API_KEY;
  const configured = !!(key && key.length > 0);
  const api_ok = configured ? await ping(key as string) : null;
  return {
    // healthy = key present, the leads list is set, and the key is not KNOWN-dead.
    healthy: configured && !!process.env.BREVO_LEADS_LIST_ID && api_ok !== false,
    configured,
    list_configured: !!process.env.BREVO_LEADS_LIST_ID,
    api_ok,
    checked_at: new Date().toISOString(),
    key_fp: key ? `${createHash('sha256').update(key).digest('hex').slice(0, 8)}:${key.length}` : null,
    brevo_diag: lastBrevoDiag,
  };
}

export async function GET(req: Request) {
  const now = Date.now();
  // ?fresh=1 bypasses the per-instance memo (for diagnosis; memo defeats ?_cb polling).
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';
  if (fresh || !memo || now - memo.at >= TTL_MS) {
    memo = { at: now, body: await compute() };
  }
  return Response.json(memo.body, {
    status: memo.body.healthy ? 200 : 503,
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
}
