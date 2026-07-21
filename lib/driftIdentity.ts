// Drift install identity (WS-B) - Upstash-backed register/verify for opt-in SDK installs.
// Stores ONLY token_sha256 (never the raw token); no IP, no name. Fail-open on Redis errors.

import 'server-only';
import { Redis } from '@upstash/redis';
import { redisUrl, redisToken } from './env';
import { logFlagStates } from './flags';

export const INSTALL_ID = /^[0-9a-f]{32}$/;

const IDENTITIES_SET = 'drift:identities';

// Fixed dummy for constant-time compare when row is missing or revoked (64 hex chars).
const DUMMY_TOKEN_SHA256 = '0'.repeat(64);

// Cap distinct install_id verifications per ingest batch (real batches share one id).
export const MAX_AUTHED_VERIFY_PER_BATCH = 32;

export function driftIdentityEnabled(): boolean {
  logFlagStates();
  // Literal comparison, NOT the flag() helper: scripts/check-graduation-honesty.mjs
  // greps for this exact needle as a build-blocking tripwire that the drift-network
  // stays OFF by default. A dumb literal grep is the point - it cannot be fooled by
  // indirection - so route the state through logFlagStates() and leave this inline.
  return process.env.DRIFT_IDENTITY === '1';
}

let _redis: Redis | null | undefined;

/** @internal test seam: inject Redis (or null); pass undefined to reset lazy init. */
export function __setDriftIdentityRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  _redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  return _redis;
}

function identityKey(installId: string): string {
  return `drift:identity:${installId}`;
}

// Atomic revoke: clear identity binding and free oauth:gh reservation in one EVAL.
const REVOKE_SCRIPT = `
local identityKey = KEYS[1]
local github_hash = redis.call('HGET', identityKey, 'github_hash')
redis.call('HSET', identityKey, 'status', 'revoked', 'cost_class', 'none', 'github_hash', '')
if github_hash and github_hash ~= '' then
  redis.call('DEL', 'oauth:gh:' .. github_hash)
end
return 'ok'
`;

export async function sha256hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type IdentityRow = {
  token_sha256: string;
  created_at: string;
  status: string;
  cost_class: string;
  github_hash: string;
};

export type IssueIdentityResult =
  | { ok: true; token: string }
  | { conflict: true }
  | { unavailable: true };

export async function issueIdentity(
  installId: string,
  currentToken?: string,
): Promise<IssueIdentityResult | null> {
  if (!INSTALL_ID.test(installId)) return null;
  const r = redis();
  if (!r) return { unavailable: true };

  try {
    const existing = await r.hgetall<IdentityRow>(identityKey(installId));

    if (!existing?.token_sha256) {
      const token = generateToken();
      const tokenHash = await sha256hex(token);
      const now = new Date().toISOString();
      await r.hset(identityKey(installId), {
        token_sha256: tokenHash,
        created_at: now,
        status: 'active',
        cost_class: 'none',
        github_hash: '',
      } satisfies IdentityRow);
      await r.sadd(IDENTITIES_SET, installId);
      return { ok: true, token };
    }

    if (existing.status === 'revoked') {
      return { conflict: true };
    }

    if (existing.status === 'active') {
      // Claim-once: rotation requires a valid current token.
      // Bounded TOCTOU: HGETALL-then-HSET is non-atomic; rate-limit caps races; loser gets 409.
      if (!currentToken || !(await verifyToken(installId, currentToken))) {
        return { conflict: true };
      }
      const token = generateToken();
      const tokenHash = await sha256hex(token);
      await r.hset(identityKey(installId), {
        token_sha256: tokenHash,
        created_at: existing.created_at,
        status: 'active',
        cost_class: existing.cost_class ?? 'none',
        github_hash: existing.github_hash ?? '',
      });
      return { ok: true, token };
    }

    return { conflict: true };
  } catch {
    return { unavailable: true };
  }
}

export async function verifyToken(installId: string, token: string): Promise<boolean> {
  const r = redis();
  if (!r) return false;

  try {
    const row = await r.hgetall<IdentityRow>(identityKey(installId));
    const hash = await sha256hex(token);
    const stored =
      row?.token_sha256 && row.status === 'active' ? row.token_sha256 : DUMMY_TOKEN_SHA256;
    return timingSafeEqual(hash, stored);
  } catch {
    return false;
  }
}

export async function revokeIdentity(installId: string, token: string): Promise<boolean> {
  if (!(await verifyToken(installId, token))) return false;
  const r = redis();
  if (!r) return false;

  try {
    await r.eval(REVOKE_SCRIPT, [identityKey(installId)], []);
    return true;
  } catch {
    return false;
  }
}

export async function resolveIngestAuthedInstalls(
  installIds: readonly string[],
  authorization: string | null,
): Promise<Set<string>> {
  if (!driftIdentityEnabled()) return new Set();
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? '');
  const token = bearer?.[1]?.trim();
  if (!token) return new Set();
  return authedInstallSet(installIds, token);
}

export async function authedInstallSet(
  installIds: readonly string[],
  token: string,
): Promise<Set<string>> {
  const distinct = [...new Set(installIds)];
  const toVerify = distinct.slice(0, MAX_AUTHED_VERIFY_PER_BATCH);

  const results = await Promise.all(
    toVerify.map(async (id) => {
      try {
        return (await verifyToken(id, token)) ? id : null;
      } catch {
        return null;
      }
    }),
  );

  const authed = new Set<string>();
  for (const id of results) {
    if (id) authed.add(id);
  }
  return authed;
}
