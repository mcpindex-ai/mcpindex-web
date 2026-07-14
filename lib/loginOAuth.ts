// Self-serve login: GitHub OAuth -> mint a free api_key bound to the account -> hand it to the
// gate CLI's localhost listener. Uses a dedicated GitHub OAuth app when MCPINDEX_LOGIN_CLIENT_ID/
// SECRET are set (isolated from drift's credentials), else falls back to the drift app
// (DRIFT_OAUTH_CLIENT_ID/SECRET). Login-specific redirect_uri (MCPINDEX_LOGIN_REDIRECT_URI).
// Inert until MCPINDEX_LOGIN_ENABLED=1.
//
// SECURITY (load-bearing):
// - The CLI callback URL is LOOPBACK-ONLY (http://127.0.0.1|localhost[:port]). The minted key is
//   POSTed there, so a non-loopback callback would exfiltrate the key -> rejected at start AND
//   re-checked at completion (defense in depth).
// - owner_hash = SHA-256(github:<id>:pepper) - a one-way hash, never PII (drift github_hash
//   discipline). Pepper is REQUIRED (no pepper -> unavailable, never an unsalted hash).
// - Issuance is FAIL-CLOSED (issueKey returns null on any failure -> we do not hand back a key).
// - I/O (state store, GitHub transport, issue fn) is injected, so the logic is unit-tested with
//   no network / no Redis.

import { createHash, randomBytes } from 'node:crypto';
import { issueApiKey } from './issueKey';

const STATE_TTL_SEC = 600;
const LOGIN_STATE = /^[0-9a-f]{64}$/;
// Loopback only: http://127.0.0.1 or http://localhost, optional :port, optional path. No other host.
// LOAD-BEARING for BOTH SSRF *and* CSRF: the entire CSRF guarantee rests on the minted key being
// delivered only to the user's own loopback (an attacker can't reach the victim's 127.0.0.1).
// Never widen this to a LAN host or a custom scheme without adding a second line of defense.
const LOOPBACK_CB = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?(?:\/[A-Za-z0-9._~\-/]*)?$/;

export function loginEnabled(): boolean {
  return process.env.MCPINDEX_LOGIN_ENABLED === '1';
}

export function isLoopbackCallback(cb: string): boolean {
  // Reject CR/LF explicitly: JS `$` (no `m` flag) also matches just before a single trailing newline.
  return typeof cb === 'string' && cb.length <= 128 && !/[\r\n]/.test(cb) && LOOPBACK_CB.test(cb);
}

/** The owner-hash pepper (login-specific, falls back to the drift pepper). Empty = misconfigured. */
function loginPepper(): string {
  return process.env.MCPINDEX_LOGIN_PEPPER ?? process.env.DRIFT_OAUTH_PEPPER ?? '';
}

// GitHub OAuth client credentials: prefer a dedicated login app; fall back to the drift app.
function loginClientId(): string | undefined {
  return process.env.MCPINDEX_LOGIN_CLIENT_ID ?? process.env.DRIFT_OAUTH_CLIENT_ID;
}
function loginClientSecret(): string | undefined {
  return process.env.MCPINDEX_LOGIN_CLIENT_SECRET ?? process.env.DRIFT_OAUTH_CLIENT_SECRET;
}

export interface StateStore {
  set(key: string, value: string, ttlSec: number): Promise<boolean>;
  getdel(key: string): Promise<string | null>;
}

export interface LoginTransport {
  exchangeCode(code: string): Promise<string | null>;
  fetchUserId(accessToken: string): Promise<string | null>;
}

export type IssueFn = (
  ownerHash: string,
  opts: { tier?: string; provider?: string },
) => Promise<string | null>;

function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function genState(): string {
  return randomBytes(32).toString('hex');
}

function stateKey(state: string): string {
  return `login:state:${state}`;
}

export function buildAuthorizeUrl(state: string): string | null {
  const clientId = loginClientId();
  const redirectUri = process.env.MCPINDEX_LOGIN_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'read:user', // identity only - NEVER repo scope
    state,
    redirect_uri: redirectUri,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export type StartResult = { url: string } | { error: 'bad_callback' | 'unavailable' };

export async function startLogin(cliCallback: string, store: StateStore): Promise<StartResult> {
  if (!loginEnabled()) return { error: 'unavailable' }; // defense in depth: the route also gates this
  if (!isLoopbackCallback(cliCallback)) return { error: 'bad_callback' }; // SSRF/CSRF: loopback only
  if (!loginPepper()) return { error: 'unavailable' }; // fail fast: don't burn state on a misconfigured deploy
  const state = genState();
  const url = buildAuthorizeUrl(state);
  if (!url) return { error: 'unavailable' };
  try {
    const ok = await store.set(stateKey(state), cliCallback, STATE_TTL_SEC);
    if (!ok) return { error: 'unavailable' };
    return { url };
  } catch {
    return { error: 'unavailable' };
  }
}

export type CompleteResult =
  | { ok: true; apiKey: string; cliCallback: string }
  | { error: 'invalid_state' | 'invalid_request' | 'exchange_failed' | 'issue_failed' | 'unavailable' };

async function githubExchange(code: string): Promise<string | null> {
  const clientId = loginClientId();
  const clientSecret = loginClientSecret();
  const redirectUri = process.env.MCPINDEX_LOGIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return typeof data.access_token === 'string' ? data.access_token : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function githubUserId(accessToken: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id?: number };
    return typeof data.id === 'number' ? String(data.id) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const defaultLoginTransport: LoginTransport = {
  exchangeCode: githubExchange,
  fetchUserId: githubUserId,
};

export async function completeLogin(
  state: string,
  code: string,
  store: StateStore,
  transport: LoginTransport = defaultLoginTransport,
  issue: IssueFn = issueApiKey,
): Promise<CompleteResult> {
  if (!loginEnabled()) return { error: 'unavailable' }; // defense in depth: the route also gates this
  if (!LOGIN_STATE.test(state)) return { error: 'invalid_state' };
  if (!code || typeof code !== 'string') return { error: 'invalid_request' };

  let cliCallback: string | null;
  try {
    cliCallback = await store.getdel(stateKey(state)); // one-time: consume the state
  } catch {
    return { error: 'unavailable' };
  }
  if (!cliCallback || !isLoopbackCallback(cliCallback)) return { error: 'invalid_state' };

  const token = await transport.exchangeCode(code);
  if (!token) return { error: 'exchange_failed' };
  const ghId = await transport.fetchUserId(token);
  if (!ghId) return { error: 'exchange_failed' };

  const pepper = loginPepper();
  if (!pepper) return { error: 'unavailable' }; // never an unsalted owner hash

  const ownerHash = sha256hex(`github:${ghId}:${pepper}`);
  const apiKey = await issue(ownerHash, { tier: 'free', provider: 'github' });
  if (!apiKey) return { error: 'issue_failed' }; // fail-closed: no key if not persisted

  return { ok: true, apiKey, cliCallback };
}
