// Drift OAuth upgrade (WS-C) - GitHub cost-class binding via one-way github_hash.
// Stores ONLY github_hash (never token, raw id, username, or code). Fail-open on Redis errors.

import { Redis } from '@upstash/redis';
import { INSTALL_ID, sha256hex, verifyToken } from './driftIdentity';

export const OAUTH_STATE = /^[0-9a-f]{64}$/;

const STATE_TTL_SEC = 600;

export function oauthEnabled(): boolean {
  return process.env.DRIFT_OAUTH_UPGRADE === '1';
}

let _redis: Redis | null | undefined;

/** @internal test seam: inject Redis (or null); pass undefined to reset lazy init. */
export function __setDriftOAuthRedisForTest(client: Redis | null | undefined): void {
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

function stateKey(state: string): string {
  return `oauth:state:${state}`;
}

function ghKey(githubHash: string): string {
  return `oauth:gh:${githubHash}`;
}

// Atomic reserve+bind: active-check, rebind-reject, one-per-GH, identity update in one EVAL.
const BIND_GITHUB_SCRIPT = `
local identityKey = KEYS[1]
local ghRedisKey = KEYS[2]
local githubHash = ARGV[1]
local installId = ARGV[2]

local token_sha256 = redis.call('HGET', identityKey, 'token_sha256')
local status = redis.call('HGET', identityKey, 'status')
if not token_sha256 or status ~= 'active' then
  return 'inactive'
end

local cost_class = redis.call('HGET', identityKey, 'cost_class')
local github_hash = redis.call('HGET', identityKey, 'github_hash')
if cost_class == 'github' and github_hash and github_hash ~= '' and github_hash ~= githubHash then
  return 'already_bound'
end

local existing = redis.call('GET', ghRedisKey)
if existing and existing ~= installId then
  return 'already_bound'
end

redis.call('SET', ghRedisKey, installId)
redis.call('HSET', identityKey, 'cost_class', 'github', 'github_hash', githubHash)
return 'ok'
`;

export interface OAuthTransport {
  exchangeCode(code: string): Promise<string | null>;
  fetchUserId(accessToken: string): Promise<string | null>;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(timer);
  }
}

const defaultTransport: OAuthTransport = {
  async exchangeCode(code: string): Promise<string | null> {
    const clientId = process.env.DRIFT_OAUTH_CLIENT_ID;
    const clientSecret = process.env.DRIFT_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.DRIFT_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) return null;
    try {
      const res = await fetchWithTimeout('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { access_token?: string };
      return typeof data.access_token === 'string' ? data.access_token : null;
    } catch {
      return null;
    }
  },

  async fetchUserId(accessToken: string): Promise<string | null> {
    try {
      const res = await fetchWithTimeout('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { id?: number };
      return typeof data.id === 'number' ? String(data.id) : null;
    } catch {
      return null;
    }
  },
};

function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function buildAuthorizeUrl(state: string): string | null {
  const clientId = process.env.DRIFT_OAUTH_CLIENT_ID;
  const redirectUri = process.env.DRIFT_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user',
    state,
    redirect_uri: redirectUri,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export type StartUpgradeResult =
  | { url: string }
  | { error: 'unauthorized' }
  | { unavailable: true };

export async function startUpgrade(
  installId: string,
  token: string,
): Promise<StartUpgradeResult | null> {
  if (!INSTALL_ID.test(installId)) return null;
  if (!(await verifyToken(installId, token))) return { error: 'unauthorized' };

  const r = redis();
  if (!r) return { unavailable: true };

  const state = generateState();
  const url = buildAuthorizeUrl(state);
  if (!url) return { unavailable: true };

  try {
    const set = await r.set(stateKey(state), installId, { nx: true, ex: STATE_TTL_SEC });
    if (!set) return { unavailable: true };
    return { url };
  } catch {
    return { unavailable: true };
  }
}

export type BindGithubResult =
  | { ok: true; cost_class: 'github' }
  | { error: 'invalid_state' | 'exchange_failed' | 'already_bound' }
  | { unavailable: true };

// TEST-ONLY seam: override the default GitHub transport the callback route uses (it calls
// bindGithub without a transport arg). Inert in production. Mirrors the fetch/redis seams.
let _oauthTransport: OAuthTransport | undefined;
export function __setOAuthTransportForTest(t: OAuthTransport | undefined): void {
  _oauthTransport = t;
}

export async function bindGithub(
  state: string,
  code: string,
  transport?: OAuthTransport,
): Promise<BindGithubResult> {
  transport = transport ?? _oauthTransport ?? defaultTransport;
  if (!OAUTH_STATE.test(state)) return { error: 'invalid_state' };
  if (!code || typeof code !== 'string') return { error: 'exchange_failed' };

  const r = redis();
  if (!r) return { unavailable: true };

  try {
    const installId = await r.get<string>(stateKey(state));
    await r.del(stateKey(state));
    if (!installId || !INSTALL_ID.test(installId)) return { error: 'invalid_state' };

    const accessToken = await transport.exchangeCode(code);
    if (!accessToken) return { error: 'exchange_failed' };

    const ghId = await transport.fetchUserId(accessToken);
    if (!ghId) return { error: 'exchange_failed' };

    const pepper = process.env.DRIFT_OAUTH_PEPPER ?? '';
    if (!pepper) return { unavailable: true };

    const githubHash = await sha256hex(ghId + pepper);

    const evalResult = await r.eval<[string, string], string>(
      BIND_GITHUB_SCRIPT,
      [identityKey(installId), ghKey(githubHash)],
      [githubHash, installId],
    );

    if (evalResult === 'ok') return { ok: true, cost_class: 'github' };
    if (evalResult === 'already_bound') return { error: 'already_bound' };
    if (evalResult === 'inactive') return { error: 'exchange_failed' };
    return { unavailable: true };
  } catch {
    return { unavailable: true };
  }
}
