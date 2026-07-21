// Self-serve login: GitHub OR Google OAuth -> mint a free api_key bound to the account -> hand it
// to the gate CLI's localhost listener. GitHub uses a dedicated OAuth app when
// MCPINDEX_LOGIN_CLIENT_ID/SECRET are set (isolated from drift's credentials), else falls back to
// the drift app (DRIFT_OAUTH_CLIENT_ID/SECRET). Google uses its own dedicated app
// (MCPINDEX_GOOGLE_CLIENT_ID/SECRET) with NO fallback to the github/drift creds. Both share the
// login redirect_uri (Google: MCPINDEX_GOOGLE_REDIRECT_URI, else MCPINDEX_LOGIN_REDIRECT_URI) and
// the owner-hash pepper. Inert until MCPINDEX_LOGIN_ENABLED=1; each provider is independently inert
// until ITS client env is configured (unconfigured provider -> unavailable, never a broken flow).
//
// SECURITY (load-bearing):
// - The CLI callback URL is LOOPBACK-ONLY (http://127.0.0.1|localhost[:port]). The minted key is
//   POSTed there, so a non-loopback callback would exfiltrate the key -> rejected at start AND
//   re-checked at completion (defense in depth).
// - owner_hash = SHA-256(<provider>:<subject>:pepper) - a one-way hash, never PII (drift github_hash
//   discipline). GitHub subject = numeric user id; Google subject = OIDC `sub` (NEVER email, which
//   is mutable/reassignable). Pepper is REQUIRED (no pepper -> unavailable, never an unsalted hash).
// - The chosen provider is persisted WITH the loopback callback in the one-time state, so the
//   callback leg trusts the state (not a client-supplied param) for which token/userinfo endpoints
//   to hit. The loopback/nonce/CLI handoff is provider-agnostic and unchanged.
// - Issuance is FAIL-CLOSED (issueKey returns null on any failure -> we do not hand back a key).
// - I/O (state store, OAuth transport, issue fn) is injected, so the logic is unit-tested with
//   no network / no Redis.

import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { issueApiKey } from './issueKey';
import { flag, logFlagStates } from './flags';

const STATE_TTL_SEC = 600;
const LOGIN_STATE = /^[0-9a-f]{64}$/;
// Loopback only: http://127.0.0.1 or http://localhost, optional :port, optional path. No other host.
// LOAD-BEARING for BOTH SSRF *and* CSRF: the entire CSRF guarantee rests on the minted key being
// delivered only to the user's own loopback (an attacker can't reach the victim's 127.0.0.1).
// Never widen this to a LAN host or a custom scheme without adding a second line of defense.
const LOOPBACK_CB = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?(?:\/[A-Za-z0-9._~\-/]*)?$/;

// Supported self-serve identity providers. Default is 'github' everywhere for backward-compat.
export type LoginProvider = 'github' | 'google';

/** Coerce arbitrary input to a known provider; anything but the exact 'google' string -> github. */
export function normalizeProvider(p: string | null | undefined): LoginProvider {
  return p === 'google' ? 'google' : 'github';
}

export function loginEnabled(): boolean {
  logFlagStates();
  return flag('MCPINDEX_LOGIN_ENABLED');
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

// Google OAuth client credentials: DEDICATED app only, NO fallback to the github/drift creds
// (a Google `code` is meaningless to a GitHub app and vice-versa). Unset -> provider is inert.
function googleClientId(): string | undefined {
  return process.env.MCPINDEX_GOOGLE_CLIENT_ID;
}
function googleClientSecret(): string | undefined {
  return process.env.MCPINDEX_GOOGLE_CLIENT_SECRET;
}
// Reuse the same callback path as GitHub; allow a Google-specific override for flexibility.
function googleRedirectUri(): string | undefined {
  return process.env.MCPINDEX_GOOGLE_REDIRECT_URI ?? process.env.MCPINDEX_LOGIN_REDIRECT_URI;
}

export interface StateStore {
  set(key: string, value: string, ttlSec: number): Promise<boolean>;
  getdel(key: string): Promise<string | null>;
}

// Provider-aware transport: `provider` selects the token/userinfo endpoints. `fetchUserId` returns
// the provider's STABLE subject (GitHub numeric id, Google OIDC `sub`) - never an email.
export interface LoginTransport {
  exchangeCode(provider: LoginProvider, code: string): Promise<string | null>;
  fetchUserId(provider: LoginProvider, accessToken: string): Promise<string | null>;
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

// The delivery mode chosen at start: 'cli' hands the key to a loopback listener (the gate CLI);
// 'web' hands it to the browser (postMessage to the opener / same-origin display page). The mode
// is persisted in the trusted state so the callback leg — which only holds the `state` handle —
// knows how to deliver, and can never be steered by a client-supplied callback param.
export type LoginMode = 'cli' | 'web';

// The stored state value carries the delivery MODE, the (loopback) callback for cli, AND the chosen
// provider, so the callback leg (which only has the `state` handle) knows which endpoints to use and
// how to deliver the key. Encoded as JSON. Backward-compat: a legacy bare-string value (pre-provider)
// decodes as a cli github callback, so in-flight/older states and the existing tests keep working.
function encodeState(cliCallback: string, provider: LoginProvider): string {
  return JSON.stringify({ cb: cliCallback, provider });
}

// Web mode stores NO callback (the key is delivered to the browser, not a loopback URL), so there
// is nothing to exfiltrate via the stored callback field. `mode:'web'` is the only discriminant.
function encodeWebState(provider: LoginProvider): string {
  return JSON.stringify({ mode: 'web', provider });
}

function decodeState(raw: string): { mode: LoginMode; cliCallback: string; provider: LoginProvider } {
  try {
    const parsed = JSON.parse(raw) as { cb?: unknown; provider?: unknown; mode?: unknown };
    if (parsed && typeof parsed === 'object') {
      const provider = normalizeProvider(parsed.provider as string);
      if (parsed.mode === 'web') {
        return { mode: 'web', cliCallback: '', provider }; // web: no loopback callback
      }
      if (typeof parsed.cb === 'string') {
        return { mode: 'cli', cliCallback: parsed.cb, provider };
      }
    }
  } catch {
    /* not JSON -> legacy bare callback string */
  }
  return { mode: 'cli', cliCallback: raw, provider: 'github' }; // legacy value is always a cli github callback
}

export function buildAuthorizeUrl(state: string, provider: LoginProvider = 'github'): string | null {
  if (provider === 'google') return buildGoogleAuthorizeUrl(state);
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

function buildGoogleAuthorizeUrl(state: string): string | null {
  const clientId = googleClientId();
  const redirectUri = googleRedirectUri();
  if (!clientId || !redirectUri) return null; // unconfigured -> caller returns `unavailable` (inert)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email', // identity only - the minimal scope to obtain a stable `sub`
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type StartResult = { url: string } | { error: 'bad_callback' | 'unavailable' };

export async function startLogin(
  cliCallback: string,
  store: StateStore,
  provider: LoginProvider = 'github',
): Promise<StartResult> {
  if (!loginEnabled()) return { error: 'unavailable' }; // defense in depth: the route also gates this
  if (!isLoopbackCallback(cliCallback)) return { error: 'bad_callback' }; // SSRF/CSRF: loopback only
  if (!loginPepper()) return { error: 'unavailable' }; // fail fast: don't burn state on a misconfigured deploy
  const state = genState();
  const url = buildAuthorizeUrl(state, provider);
  if (!url) return { error: 'unavailable' }; // provider unconfigured -> inert
  try {
    // Persist the provider WITH the callback so the callback leg is provider-driven by trusted state.
    const ok = await store.set(stateKey(state), encodeState(cliCallback, provider), STATE_TTL_SEC);
    if (!ok) return { error: 'unavailable' };
    return { url };
  } catch {
    return { error: 'unavailable' };
  }
}

// BROWSER (web) start: identical OAuth machinery as `startLogin` (provider allowlist via
// buildAuthorizeUrl, one-time state in the shared store, pepper/flag gates) but delivers the key to
// the browser instead of a loopback listener — so there is NO cli_callback and no loopback
// validation to perform. Additive: the loopback `startLogin` above is untouched. The callback route
// dispatches on the stored `mode:'web'` marker.
export async function startLoginWeb(
  store: StateStore,
  provider: LoginProvider = 'github',
): Promise<StartResult> {
  if (!loginEnabled()) return { error: 'unavailable' }; // defense in depth: the route also gates this
  if (!loginPepper()) return { error: 'unavailable' }; // fail fast: don't burn state on a misconfigured deploy
  const state = genState();
  const url = buildAuthorizeUrl(state, provider);
  if (!url) return { error: 'unavailable' }; // provider unconfigured -> inert
  try {
    const ok = await store.set(stateKey(state), encodeWebState(provider), STATE_TTL_SEC);
    if (!ok) return { error: 'unavailable' };
    return { url };
  } catch {
    return { error: 'unavailable' };
  }
}

// The ok result carries the delivery `mode`. Both ok branches keep `cliCallback` (web = '') so the
// existing loopback tests type-check byte-unchanged; the callback route dispatches on `mode` and
// never reads `cliCallback` in web mode.
export type CompleteResult =
  | { ok: true; mode: 'cli'; apiKey: string; cliCallback: string }
  | { ok: true; mode: 'web'; apiKey: string; cliCallback: '' }
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

async function googleExchange(code: string): Promise<string | null> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  const redirectUri = googleRedirectUri();
  if (!clientId || !clientSecret || !redirectUri) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
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

async function googleSubject(accessToken: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: controller.signal,
      redirect: 'manual',
    });
    if (!res.ok) return null;
    // `sub` is the ONLY stable, non-reassignable identifier - never key on email.
    const data = (await res.json()) as { sub?: string };
    return typeof data.sub === 'string' && data.sub ? data.sub : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const defaultLoginTransport: LoginTransport = {
  exchangeCode: (provider, code) => (provider === 'google' ? googleExchange(code) : githubExchange(code)),
  fetchUserId: (provider, token) => (provider === 'google' ? googleSubject(token) : githubUserId(token)),
};

// TEST-ONLY seams: override the GitHub transport + key-issuer the callback route relies on (it calls
// completeLogin with only state/code/store, so both fall to their defaults). Inert in production.
let _loginTransport: LoginTransport | undefined;
let _loginIssue: IssueFn | undefined;
export function __setLoginTransportForTest(t: LoginTransport | undefined): void { _loginTransport = t; }
export function __setLoginIssueForTest(i: IssueFn | undefined): void { _loginIssue = i; }

export async function completeLogin(
  state: string,
  code: string,
  store: StateStore,
  transport?: LoginTransport,
  issue?: IssueFn,
): Promise<CompleteResult> {
  transport = transport ?? _loginTransport ?? defaultLoginTransport;
  issue = issue ?? _loginIssue ?? issueApiKey;
  if (!loginEnabled()) return { error: 'unavailable' }; // defense in depth: the route also gates this
  if (!LOGIN_STATE.test(state)) return { error: 'invalid_state' };
  if (!code || typeof code !== 'string') return { error: 'invalid_request' };

  let raw: string | null;
  try {
    raw = await store.getdel(stateKey(state)); // one-time: consume the state
  } catch {
    return { error: 'unavailable' };
  }
  if (!raw) return { error: 'invalid_state' };
  // Mode + provider come from the trusted stored state, never from a client-supplied param.
  const { mode, cliCallback, provider } = decodeState(raw);
  // cli delivers to a loopback URL, so re-validate it loopback-only (defense in depth). web delivers
  // to the browser (no URL), so there is nothing to re-validate here.
  if (mode === 'cli' && !isLoopbackCallback(cliCallback)) return { error: 'invalid_state' };

  const token = await transport.exchangeCode(provider, code);
  if (!token) return { error: 'exchange_failed' };
  const subject = await transport.fetchUserId(provider, token);
  if (!subject) return { error: 'exchange_failed' };

  const pepper = loginPepper();
  if (!pepper) return { error: 'unavailable' }; // never an unsalted owner hash

  // owner_hash = sha256(<provider>:<subject>:pepper) - one-way, peppered, no raw PII stored.
  const ownerHash = sha256hex(`${provider}:${subject}:${pepper}`);
  const apiKey = await issue(ownerHash, { tier: 'free', provider });
  if (!apiKey) return { error: 'issue_failed' }; // fail-closed: no key if not persisted

  return mode === 'web'
    ? { ok: true, mode: 'web', apiKey, cliCallback: '' }
    : { ok: true, mode: 'cli', apiKey, cliCallback };
}
