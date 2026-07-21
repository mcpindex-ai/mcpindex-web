// Shared contract between the BROWSER (web) self-serve login callback and the in-page wizard that
// initiates it. The wizard imports these SAME constants so both sides agree byte-for-byte on the
// postMessage envelope and the origin they trust — a drift between the two would silently break
// key delivery (or, worse, widen the targetOrigin). Keep this module free of `server-only` and of
// any Node/secret imports: the wizard is a client component and must be able to import the
// constants safely. The env resolver reads `process.env` only when called on the server (the
// callback route); called in the browser it resolves to the default, which is harmless because the
// wizard validates delivery against its own `window.location.origin`, not this value.

/**
 * The message `type` the callback posts to `window.opener`. The wizard listens for exactly this.
 * Envelope: `{ type: WEB_LOGIN_MESSAGE_TYPE, key: 'mcpk_...' }`.
 *
 * RECEIVER CONTRACT (load-bearing — the wizard MUST enforce all three before trusting `key`):
 *   1. `event.origin === window.location.origin` (same-origin; the popup is served from this site).
 *   2. `event.source === <the exact popup window the wizard opened>` — reject any message whose
 *      `type` matches but whose source is not the wizard's own popup. Without this, another
 *      same-origin page an attacker can drive could inject an attacker-controlled key
 *      (key-confusion / account-linking). The strict `targetOrigin` on the sender is necessary
 *      but NOT sufficient on its own.
 *   3. `event.data.type === WEB_LOGIN_MESSAGE_TYPE` and `typeof event.data.key === 'string'`.
 */
export const WEB_LOGIN_MESSAGE_TYPE = 'mcpindex-api-key' as const;

/** The env var that pins the site origin used as the STRICT postMessage `targetOrigin` (prod vs preview). */
export const SITE_ORIGIN_ENV = 'MCPINDEX_SITE_ORIGIN' as const;

/** Production default when the env is unset. NEVER `'*'`. */
export const DEFAULT_SITE_ORIGIN = 'https://mcpindex.ai' as const;

// A concrete `https://host[:port]` origin — no path, no query, and crucially no `'*'`. Used to
// reject a misconfigured env value so a bad deploy can never downgrade the targetOrigin to a
// wildcard or a malformed string.
const ORIGIN_RE = /^https:\/\/[a-z0-9.-]+(?::\d{1,5})?$/i;

// Canonical production hosts, used ONLY by the misconfig tripwire below — never for an
// authorization decision (the wizard's real security check is event.origin === window.location.origin).
const CANONICAL_PRODUCTION_ORIGINS: readonly string[] = [DEFAULT_SITE_ORIGIN, 'https://www.mcpindex.ai'];

/**
 * The exact site origin to use as the postMessage `targetOrigin` for web-mode key delivery.
 * Reads `MCPINDEX_SITE_ORIGIN` (per-environment: prod vs preview), falling back to the prod
 * default. A malformed/wildcard env value is rejected in favor of the default — the targetOrigin
 * is a security control, so it fails toward the strict known-good origin, never toward `'*'`.
 */
export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  const raw = (env[SITE_ORIGIN_ENV] ?? '').trim();
  const resolved = raw && raw !== '*' && ORIGIN_RE.test(raw) ? raw : DEFAULT_SITE_ORIGIN;
  // Production misconfig tripwire: a SYNTACTICALLY VALID but WRONG origin (a typo, or a staging
  // URL accidentally set in prod) passes ORIGIN_RE above and is returned as-is — the regex can
  // only catch "malformed", never "wrong". The real-world failure mode: the postMessage
  // targetOrigin silently mismatches window.location.origin in the browser, delivery is refused,
  // and every web sign-in quietly degrades to the copy-paste fallback with NO server-side signal
  // anything is wrong. Surface it loudly in Vercel's runtime logs instead — purely additive, never
  // changes the returned value or any security check.
  if (env.VERCEL_ENV === 'production' && !CANONICAL_PRODUCTION_ORIGINS.includes(resolved)) {
    console.error(
      `[webLoginContract] MCPINDEX_SITE_ORIGIN misconfig: resolved to "${resolved}" in production, ` +
        `expected one of ${CANONICAL_PRODUCTION_ORIGINS.join(', ')}. Web sign-in key delivery will ` +
        'silently degrade to copy-paste for every user until this is fixed.',
    );
  }
  return resolved;
}
