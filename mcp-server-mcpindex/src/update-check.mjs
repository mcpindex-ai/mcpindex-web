// update-check.mjs - best-effort "a newer mcp-server-mcpindex exists" notice.
//
// Why this is safe to ship in a server that already egresses:
//   - outbound to the PINNED npm registry host only, https, no redirect-following
//     (no SSRF pivot), time-boxed, and fail-silent on ANY error;
//   - fire-and-forget - it never blocks or crashes startup (the caller drops it
//     onto the event loop after connect and ignores rejections);
//   - no telemetry beyond the standard registry GET (no version of the user, no
//     machine id - just "what's the latest published version of this package");
//   - opt-out via MCPINDEX_NO_UPDATE_CHECK.
//
// Pure + injectable (fetchImpl) so it is unit-testable with no network.

const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
const DEFAULT_PKG = 'mcp-server-mcpindex';
const DEFAULT_TIMEOUT_MS = 2500;

/** major.minor.patch -> [n,n,n]; drops prerelease/build; 9-digit cap (DoS guard).
 *  Returns null for anything non-canonical (so an odd tag never triggers a nag). */
export function parseSemver(v) {
  if (typeof v !== 'string') return null;
  const core = v.trim().split('+')[0].split('-')[0];
  const parts = core.split('.');
  if (parts.length !== 3) return null;
  const nums = [];
  for (const p of parts) {
    if (!/^\d{1,9}$/.test(p)) return null;
    nums.push(Number(p));
  }
  return nums;
}

/** true iff `current` is a strictly-older canonical semver than `latest`.
 *  Unparseable on either side -> false (never nag on ambiguity). */
export function isOlder(current, latest) {
  const a = parseSemver(current);
  const b = parseSemver(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

/** The user-facing line. Advisory voice; carries the restart reminder because a
 *  running MCP server is only replaced when the host restarts it. */
export function formatUpdateMessage(current, latest) {
  return (
    `mcp-server-mcpindex ${current} -> ${latest} available. ` +
    `Update: npm i -g mcp-server-mcpindex@latest ` +
    `(or npx fetches it on next launch), then restart your MCP host ` +
    `(Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed) to load it.`
  );
}

/** Disabled when MCPINDEX_NO_UPDATE_CHECK is set to any non-falsey value. */
export function updateCheckDisabled(env = process.env) {
  const raw = (env.MCPINDEX_NO_UPDATE_CHECK ?? '').trim().toLowerCase();
  return raw !== '' && raw !== '0' && raw !== 'false' && raw !== 'no' && raw !== 'off';
}

/** Fetch the latest published version string, or null on ANY failure/timeout.
 *  Never throws. `fetchImpl` is injectable for tests. */
export async function fetchLatestVersion({
  registry = DEFAULT_REGISTRY,
  pkg = DEFAULT_PKG,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${registry}/${encodeURIComponent(pkg)}/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      redirect: 'error', // SSRF: never follow a redirect off the pinned host
    });
    if (!res || !res.ok) return null;
    const body = await res.json();
    const v = body && typeof body.version === 'string' ? body.version : null;
    return v && parseSemver(v) ? v : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Orchestration: check, and if a newer version exists, emit the notice to STDERR only.
 *  stderr is the UNIVERSAL channel - every MCP host (Cursor, Claude Desktop/Code, Gemini
 *  CLI, …) surfaces a spawned server's stderr in its per-server log. We deliberately do NOT
 *  emit an MCP `notifications/message`: hosts render it inconsistently (Cursor logs it as a
 *  bare ` undefined`, swallowing the text), so it only adds noise where stderr already
 *  carries the message cleanly. Returns the message it emitted (or null) - handy for
 *  tests/callers. Never throws; never blocks the caller (caller fire-and-forgets). */
export async function notifyUpdateIfAvailable({
  currentVersion,
  env = process.env,
  log = (m) => console.error(`[mcp-server-mcpindex] ${m}`),
  fetchImpl = fetch,
  pkg = DEFAULT_PKG,
} = {}) {
  try {
    if (updateCheckDisabled(env)) return null;
    const latest = await fetchLatestVersion({ pkg, fetchImpl });
    if (!latest || !isOlder(currentVersion, latest)) return null;
    const msg = formatUpdateMessage(currentVersion, latest);
    log(msg); // stderr - the one channel every host renders cleanly
    return msg;
  } catch {
    return null; // belt-and-suspenders: this path must never surface an error
  }
}
