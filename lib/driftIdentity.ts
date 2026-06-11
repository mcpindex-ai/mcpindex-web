// Drift install identity (WS-B) — Upstash-backed register/verify for opt-in SDK installs.
// Stores ONLY token_sha256 (never the raw token); no IP, no name. Fail-open on Redis errors.

import { Redis } from '@upstash/redis';

export const INSTALL_ID = /^[0-9a-f]{32}$/;

const IDENTITIES_SET = 'drift:identities';

let _redis: Redis | null | undefined;

/** @internal test seam: inject Redis (or null); pass undefined to reset lazy init. */
export function __setDriftIdentityRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  return _redis;
}

function identityKey(installId: string): string {
  return `drift:identity:${installId}`;
}

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

export async function issueIdentity(installId: string): Promise<{ token: string } | null> {
  if (!INSTALL_ID.test(installId)) return null;
  const r = redis();
  if (!r) return null;

  try {
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
    return { token };
  } catch {
    return null;
  }
}

export async function verifyToken(installId: string, token: string): Promise<boolean> {
  const r = redis();
  if (!r) return false;

  try {
    const row = await r.hgetall<IdentityRow>(identityKey(installId));
    if (!row?.token_sha256 || row.status !== 'active') return false;
    const hash = await sha256hex(token);
    return timingSafeEqual(hash, row.token_sha256);
  } catch {
    return false;
  }
}

export async function revokeIdentity(installId: string, token: string): Promise<boolean> {
  if (!(await verifyToken(installId, token))) return false;
  const r = redis();
  if (!r) return false;

  try {
    await r.hset(identityKey(installId), { status: 'revoked' });
    return true;
  } catch {
    return false;
  }
}

export async function authedInstallSet(
  installIds: readonly string[],
  token: string,
): Promise<Set<string>> {
  const authed = new Set<string>();
  for (const id of installIds) {
    if (await verifyToken(id, token)) authed.add(id);
  }
  return authed;
}
