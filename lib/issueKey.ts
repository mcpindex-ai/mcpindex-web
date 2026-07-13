// API-key issuance - mint a tier-scoped key bound to an authenticated owner, via the Supabase
// issue_api_key RPC (mcpindex-trust/deploy/cloud/migrations/002). The TS twin of
// action_tier_issuance.py: on OAuth/magic-link login the web layer generates a random api_key,
// hashes it, POSTs the HASH (never the raw key) to the RPC, and returns the RAW key ONCE (to
// hand to the gate CLI). Only the hash is stored; the raw key never touches Supabase or a log.
//
// owner_hash is a one-way SHA-256 of the authenticated principal (provider:subject+pepper),
// computed by the caller - the same no-PII discipline as the drift github_hash.
//
// FAIL-CLOSED (opposite of the tier LOOKUP's fail-safe-to-FREE): any missing config, transport
// error, non-2xx, or malformed owner_hash/tier -> null ("could not issue"). Never return a key
// that was not persisted; the caller surfaces a retry.

import { createHash, randomBytes } from 'node:crypto';

const ISSUE_RPC_PATH = '/rest/v1/rpc/issue_api_key';
const API_KEY_PREFIX = 'mcpk_';
const SHA256_HEX = /^[0-9a-f]{64}$/;
const VALID_TIERS = new Set(['free', 'community', 'pro', 'enterprise']);
const TIMEOUT_MS = 5000;

/** A fresh high-entropy api_key (~256 bits). SHA-256'd for storage, so not reversible. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(32).toString('base64url');
}

function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export type IssueFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number }>;

export interface IssueDeps {
  env?: Record<string, string | undefined>;
  fetchImpl?: IssueFetch;
}

async function defaultFetch(
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
): Promise<{ status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
    return { status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mint an api_key for `ownerHash` at `tier` and return the RAW key once, or null on any
 * failure (fail-closed). The RPC rotates the owner prior active keys server-side, so one
 * account == one active key.
 */
export async function issueApiKey(
  ownerHash: string,
  opts: { tier?: string; provider?: string } = {},
  deps: IssueDeps = {},
): Promise<string | null> {
  const tier = opts.tier ?? 'free';
  const provider = opts.provider ?? '';
  if (!VALID_TIERS.has(tier)) return null; // never mint an unknown/typo tier
  if (!SHA256_HEX.test(ownerHash)) return null; // owner_hash MUST be sha256 hex (no raw PII)
  const env = deps.env ?? process.env;
  const url = (env.MCPINDEX_SUPABASE_URL ?? '').trim();
  const serviceKey = (env.MCPINDEX_SUPABASE_SERVICE_KEY ?? '').trim();
  if (!url || !serviceKey) return null; // not configured -> cannot issue
  const raw = generateApiKey();
  const body = JSON.stringify({
    p_key_hash: sha256hex(raw), // only the HASH is sent, never the raw key
    p_owner_hash: ownerHash,
    p_tier: tier,
    p_provider: provider,
  });
  const doFetch = deps.fetchImpl ?? defaultFetch;
  try {
    const res = await doFetch(url.replace(/\/+$/, '') + ISSUE_RPC_PATH, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body,
    });
    if (res.status < 200 || res.status >= 300) return null; // not persisted
    return raw; // persisted; hand the RAW key to the caller ONCE
  } catch {
    return null; // any transport error -> could not issue
  }
}
