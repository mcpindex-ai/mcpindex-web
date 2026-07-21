import 'server-only';

// Feature gates, and one place that says out loud what they are set to.
//
// WHY. Five `=== '1'` env gates each silently disable a whole code path, and none of them
// announced its own state. Two are load-bearing enough that "off" is indistinguishable from
// "broken" at the API boundary:
//   - DRIFT_DARK_CORROBORATION off => every non-crawl fingerprint answers `drifted:false`,
//     i.e. "not observed drifting", from a plane that was never consulted.
//   - DRIFT_IDENTITY off => every ingested stream entry is stamped auth:'0' regardless of a
//     valid bearer token.
// An operator reading prod logs could not tell whether a flag was deliberately off or had
// been dropped from the environment. `logFlagStates()` emits ONE line on first use so that
// question is answerable from the logs alone.
//
// Reading order matters: gates default to OFF. That is deliberate (a missing env var must
// never enable a half-built path), which is exactly why the state needs to be visible.

export const FLAG_NAMES = [
  'DRIFT_OAUTH_UPGRADE',
  'DRIFT_IDENTITY',
  'DRIFT_RECRAWL_HINTS',
  'DRIFT_DARK_CORROBORATION',
  'MCPINDEX_LOGIN_ENABLED',
] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

/** True only for the literal '1'. Anything else - unset, '', 'true', 'yes' - is OFF. */
export function flag(name: FlagName): boolean {
  return process.env[name] === '1';
}

/** Every gate's resolved state, for logging or a debug surface. */
export function flagStates(): Record<FlagName, boolean> {
  return Object.fromEntries(FLAG_NAMES.map((n) => [n, flag(n)])) as Record<FlagName, boolean>;
}

let _logged = false;

/**
 * Emit the resolved gate states once per process. Idempotent and safe to call from any hot
 * path - after the first call it is a boolean check. Deliberately console.info, not warn: an
 * off gate is usually intentional, and crying wolf on every cold start trains people to
 * ignore it.
 */
export function logFlagStates(): void {
  if (_logged) return;
  _logged = true;
  const s = flagStates();
  const on = FLAG_NAMES.filter((n) => s[n]);
  const off = FLAG_NAMES.filter((n) => !s[n]);
  console.info(
    `mcpindex flags: ON=[${on.join(',') || 'none'}] OFF=[${off.join(',') || 'none'}]`,
  );
}
