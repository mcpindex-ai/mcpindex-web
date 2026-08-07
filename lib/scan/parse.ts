// Pure, total parsers. Given already-parsed JSON (the component owns JSON.parse +
// its error), normalize into our data model. Never throw - hostile / malformed
// input resolves to an empty result, not an exception.

import type { ToolDef } from './vendor/preflight-types';
import type { ScannedServer, Transport } from './types';

// Secret-looking env KEY names. We report the key name, never the value.
// ('session' dropped: it over-matched SESSION_TIMEOUT/SESSION_ID; a real session
// secret still matches via token/secret.)
const SECRET_KEY_RE =
  /(^|[_-])(token|api[_-]?key|apikey|secret|password|passwd|bearer|credential|creds?|access[_-]?key|private[_-]?key|pat)($|[_-])/i;

// Secret-looking names get their own pattern PER NAMESPACE rather than one shared
// regex, because the false-positive cost differs by namespace: `session` had to be
// dropped from env names (SESSION_TIMEOUT), but as an exact-match query parameter
// it is a real credential; bare `key`/`auth` are noise as a substring but are the
// common spelling for a CLI flag.
const FLAG_SECRET_RE =
  /(^|[_-])(token|api[_-]?key|apikey|key|secret|password|passwd|bearer|credential|creds?|auth|access[_-]?key|private[_-]?key|pat)($|[_-])/i;

const QUERY_SECRET_RE =
  /^(key|api[_-]?key|apikey|token|access[_-]?token|refresh[_-]?token|secret|password|passwd|auth|authorization|sig|signature|code|credential|session|session[_-]?id)$/i;

const MASK = '***';

/** A redacted display string plus the LOCATION names of whatever it masked. The
 * locations feed detection, so a credential in a URL or an arg is reported as
 * carried, not merely hidden - masking a value while reporting the server carries
 * nothing was the original defect, one layer down. */
interface Redacted {
  readonly text: string;
  readonly found: readonly string[];
}

/** A value that looks like a credential by SHAPE rather than by the name beside it -
 * the only defense for a secret embedded in a URL path (`/s/<token>/mcp`, the shape
 * Zapier and several hosted providers ship) or passed as a bare positional arg.
 * Deliberately biased toward masking: a masked path segment costs legibility, an
 * unmasked one publishes a live token into any screenshot of the results table. */
function looksLikeSecretToken(s: string): boolean {
  if (s.length < 20 || !/^[A-Za-z0-9._~+-]+$/.test(s)) return false;
  if (/^[0-9a-f]{32,}$/i.test(s)) return true; // long hex key
  if (!/\d/.test(s) || !/[a-zA-Z]/.test(s)) return false; // prose/slug, not a token
  // Mixed case or unusually long: keeps `2024-11-05-release-notes` legible while
  // catching base64/UUID/prefixed-key shapes.
  return /[A-Z]/.test(s) || s.length >= 28;
}

/** Linear, backtracking-free fallback for strings we cannot parse structurally.
 * Splits on delimiters (kept via the capture group) and masks token-shaped parts. */
function scrubFreeText(s: string): string {
  return s
    .split(/([/?&=:@\s])/)
    .map((t) => (looksLikeSecretToken(t) ? MASK : t))
    .join('');
}

/** Redact a URL by its STRUCTURE, not as flat text: clear userinfo, mask query
 * values whose name or shape says credential, mask token-shaped path segments.
 * Masking (rather than deleting) preserves the signal that a credential was there. */
function redactUrl(raw: string): Redacted {
  const found: string[] = [];
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { text: scrubFreeText(raw), found };
  }
  if (u.username || u.password) {
    u.username = MASK;
    u.password = '';
    found.push('url:userinfo');
  }
  for (const k of [...u.searchParams.keys()]) {
    const v = u.searchParams.get(k) ?? '';
    if (QUERY_SECRET_RE.test(k) || looksLikeSecretToken(v)) {
      u.searchParams.set(k, MASK);
      found.push(`url:?${k}`);
    }
  }
  u.pathname = u.pathname
    .split('/')
    .map((seg) => {
      if (!looksLikeSecretToken(seg)) return seg;
      found.push('url:path');
      return MASK;
    })
    .join('/');
  return { text: u.toString(), found };
}

/** Redact command args POSITIONALLY, before joining. Joining first is what made
 * `--api-key sk-live-…` unmaskable: once flattened, only a `=` separator is left to
 * key off, and the space-separated form is the more common one in real configs. */
function redactArgs(args: readonly string[]): Redacted {
  const out: string[] = [];
  const found: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = a.indexOf('=');
    if (eq > 0 && FLAG_SECRET_RE.test(a.slice(0, eq))) {
      out.push(`${a.slice(0, eq + 1)}${MASK}`); // --api-key=VALUE
      found.push(`arg:${a.slice(0, eq)}`);
      continue;
    }
    // A path is never a credential, and paths are the most common long arg
    // (`/Volumes/…`, `@scope/pkg`), so shape-matching skips them.
    const pathish = a.includes('/') || a.includes('\\');
    const bareSecret = !pathish && looksLikeSecretToken(a);
    if (bareSecret) found.push('arg:positional');
    out.push(bareSecret ? MASK : a);
    // --api-key VALUE : the secret is the NEXT token. A following flag is not a value.
    if (FLAG_SECRET_RE.test(a) && eq === -1 && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      out.push(MASK);
      found.push(`arg:${a}`);
      i++;
    }
  }
  return { text: out.join(' ').trim(), found };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function looksLikeServerDef(v: unknown): boolean {
  return isObj(v) && ('command' in v || 'url' in v || 'type' in v || 'transport' in v);
}

/** Locate the server-name -> def map across the known config wrappers
 * (Claude Desktop / Cursor / Cline use `mcpServers`; VS Code uses `servers`,
 * sometimes nested under `mcp`). Falls back to "the root IS the map" only when
 * every value looks like a server def. */
function serverMap(root: unknown): Record<string, unknown> | null {
  if (!isObj(root)) return null;
  const mcp = isObj(root['mcp']) ? (root['mcp'] as Record<string, unknown>) : null;
  const candidates: unknown[] = [
    root['mcpServers'],
    root['servers'],
    mcp?.['servers'],
    mcp?.['mcpServers'],
  ];
  for (const c of candidates) if (isObj(c)) return c;
  const vals = Object.values(root);
  if (vals.length > 0 && vals.every(looksLikeServerDef)) return root;
  return null;
}

function transportOf(def: Record<string, unknown>): Transport {
  const t = String(def['type'] ?? def['transport'] ?? '')
    .toLowerCase()
    .replace(/[^a-z-]/g, '');
  if (t === 'stdio') return 'local';
  if (t === 'sse' || t === 'http' || t === 'streamable-http' || t === 'streamablehttp') return 'remote';
  if (typeof def['command'] === 'string') return 'local';
  if (typeof def['url'] === 'string') return 'remote';
  return 'unknown';
}

/** Header names that carry a credential without matching SECRET_KEY_RE
 * ('authorization' contains none of token/key/secret/...). */
const AUTH_HEADER_RE = /^(proxy-)?authorization$|^authentication$|^cookie$|^x-auth(-|$)/i;

/** A header VALUE that is self-evidently a credential even under a bland name
 * (`X-Thing: Bearer ...`). Matched against the value, reported as the key name. */
const AUTH_VALUE_RE = /^\s*(bearer|basic|token)\s+\S/i;

function secretKeysIn(
  obj: unknown,
  prefix: string,
  isSecret: (key: string, value: unknown) => boolean,
): string[] {
  if (!isObj(obj)) return [];
  return Object.entries(obj)
    .filter(([k, v]) => isSecret(k, v))
    .map(([k]) => `${prefix}${k}`);
}

/** Clients disagree on the `headers` shape: an object map in most, an array of
 * {name, value} in some. Normalize so detection sees both - an array silently
 * fell through the isObj guard and reported the server as carrying nothing. */
function normalizeHeaders(v: unknown): Record<string, unknown> {
  if (isObj(v)) return v;
  if (!Array.isArray(v)) return {};
  const out: Record<string, unknown> = {};
  for (const h of v) if (isObj(h) && typeof h['name'] === 'string') out[h['name'] as string] = h['value'];
  return out;
}

// Issuer prefixes for real credentials. DETECTION deliberately uses this narrow,
// high-precision test rather than the broad `looksLikeSecretToken` used for
// redaction: the two have opposite failure costs. An over-broad MASK only costs
// legibility, but an over-broad DETECTION is a false security claim - the tool
// telling you a server carries a credential when it carries a UUID. High recall
// for masking, high precision for reporting.
const KNOWN_SECRET_VALUE_RE =
  /^(sk-|rk_|pk_live_|ghp_|gho_|ghu_|ghs_|ghr_|github_pat_|xox[baprse]-|glpat-|figd_|dop_v1_|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|ya29\.|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/;

/** A value that betrays itself as a credential whatever the name beside it says:
 * an auth scheme prefix (`Bearer …`) or a recognizable issuer prefix. */
function isSecretValue(v: unknown): boolean {
  return typeof v === 'string' && (AUTH_VALUE_RE.test(v) || KNOWN_SECRET_VALUE_RE.test(v));
}

/** Secret-looking key names across BOTH credential locations. Remote servers
 * authenticate via `headers`, so an env-only scan called them clean. Key names
 * only - values are never returned. */
function secretKeys(def: Record<string, unknown>): string[] {
  return [
    ...secretKeysIn(def['env'], '', (k, v) => SECRET_KEY_RE.test(k) || isSecretValue(v)),
    ...secretKeysIn(
      normalizeHeaders(def['headers']),
      'header:',
      (k, v) => SECRET_KEY_RE.test(k) || AUTH_HEADER_RE.test(k) || isSecretValue(v),
    ),
  ];
}

/** Loopback hosts are exempt from the plaintext finding - traffic never leaves
 * the machine, and `http://localhost` is the normal way to run a local server. */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  // IPv4-mapped IPv6: WHATWG URL normalizes `::ffff:127.0.0.1` to `::ffff:7f00:1`,
  // so the dotted form never survives parsing - match the compressed hex and check
  // the high octet. Both spellings are handled; only the second one actually occurs.
  const mapped = /^::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}$/.exec(h);
  if (mapped) return (parseInt(mapped[1], 16) >>> 8) === 127;
  // Fully anchored: an unanchored /^127\./ would treat the registrable domain
  // `127.0.0.1.evil.com` as loopback and suppress the plaintext finding on an
  // attacker-controlled host. `.localhost` is reserved (RFC 6761), not delegated.
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '::1' ||
    /^(::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  );
}

/** true when the server is reached over plaintext http:// on a non-loopback host:
 * the credential and every tool argument cross the network readable. Gated on
 * transport so a stdio server carrying a stray `url` is not reported as an
 * insecure remote - it never speaks HTTP. */
function isInsecureTransport(def: Record<string, unknown>): boolean {
  if (transportOf(def) !== 'remote') return false;
  const raw = def['url'];
  if (typeof raw !== 'string') return false;
  const s = raw.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(s)?.[1]?.toLowerCase();
  // An explicit scheme settles it. Anything that is not http/ws is either TLS or
  // not an HTTP transport at all (file://, unix://) - claiming "plaintext http"
  // about those would be fabricating a finding.
  if (scheme) {
    if (scheme !== 'http' && scheme !== 'ws') return false;
    try {
      return !isLoopbackHost(new URL(s).hostname);
    } catch {
      return false;
    }
  }
  // Schemeless. Only claim plaintext when the value actually looks like a host
  // authority: a `url` holding `stdio`, a filesystem path, or a command line is
  // malformed, not insecure. `localhost:8000/mcp` also lands here, because it
  // PARSES as scheme `localhost:` with an empty hostname rather than throwing.
  if (!/^([a-z0-9-]+(\.[a-z0-9-]+)+|localhost)(:\d+)?(\/.*)?$/i.test(s)) return false;
  try {
    return !isLoopbackHost(new URL(`http://${s}`).hostname);
  } catch {
    return false;
  }
}

function commandString(def: Record<string, unknown>): Redacted | null {
  if (typeof def['command'] !== 'string') return null;
  // Stringify non-string args as JSON (not "[object Object]") so embedded text stays legible.
  const args = Array.isArray(def['args'])
    ? def['args'].map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    : [];
  return redactArgs([def['command'] as string, ...args]);
}

/** Normalize a pasted MCP config into a server inventory. Total. */
export function parseConfig(root: unknown): ScannedServer[] {
  const map = serverMap(root);
  if (!map) return [];
  const out: ScannedServer[] = [];
  for (const [name, defRaw] of Object.entries(map)) {
    if (!isObj(defRaw)) continue;
    const u = typeof defRaw['url'] === 'string' ? redactUrl(defRaw['url'] as string) : null;
    const c = commandString(defRaw);
    out.push({
      name: String(name),
      transport: transportOf(defRaw),
      url: u?.text ?? null,
      command: c?.text ?? null,
      // Every credential LOCATION, not just env/headers: whatever the redactors
      // had to mask is by definition a credential this server carries.
      secretKeys: [...secretKeys(defRaw), ...(u?.found ?? []), ...(c?.found ?? [])],
      insecureTransport: isInsecureTransport(defRaw),
    });
  }
  return out;
}

/** Normalize a `tools/list` dump into ToolDef[]. Accepts a bare array, a
 * `{ tools: [...] }` object, or a JSON-RPC `{ result: { tools: [...] } }`
 * envelope. Total. */
export function parseToolsList(root: unknown): ToolDef[] {
  let node: unknown = root;
  if (isObj(node) && isObj(node['result'])) node = node['result'];
  let arr: unknown;
  if (Array.isArray(node)) arr = node;
  else if (isObj(node) && Array.isArray(node['tools'])) arr = node['tools'];
  else return [];
  const out: ToolDef[] = [];
  for (const t of arr as unknown[]) {
    if (isObj(t) && typeof t['name'] === 'string') out.push(t);
  }
  return out;
}

/** JSON.parse, but tolerant of the JSONC real configs ship with (VS Code allows
 * `//` and block comments and trailing commas). Returns undefined on failure -
 * never throws. Strings inside the JSON are preserved (we skip comment-stripping
 * inside quotes). */
export function tolerantParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to the lenient pass
  }
  try {
    return JSON.parse(stripJsonc(trimmed));
  } catch {
    return undefined;
  }
}

/** Does this text look like the same config pasted twice (⌘V on top of a box the
 * paste button already filled)? Two valid documents concatenated are not valid
 * JSON, and the generic "that doesn't look like JSON" is a dead end for it.
 *
 * We only ever DIAGNOSE this - never repair it. Salvaging one of the two copies
 * would mean guessing which one the user meant and then printing a confident
 * server count from a guess, which is the one thing a gate must not do. */
export function looksLikeDoublePaste(text: string): boolean {
  const roots = text.match(/"(mcpServers|servers|tools)"\s*:/g);
  return (roots?.length ?? 0) > 1;
}

function isWs(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

/** Remove `//` + `/* *\/` comments and trailing commas, without touching content
 * inside string literals. Two string-aware passes: a global trailing-comma regex
 * would delete commas that live INSIDE string values (e.g. an arg `"[a, ]"`), so
 * the comma removal is done in its own string-aware scan, not by regex. */
function stripJsonc(src: string): string {
  // Pass 1 - strip comments (string-aware).
  let out = '';
  let inStr = false;
  let quote = '';
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++; // land on the '/'
      continue;
    }
    out += c;
  }
  // Pass 2 - drop trailing commas (a `,` whose next non-whitespace char is `}`/`]`),
  // string-aware. Comments are already gone, so whitespace-only lookahead is enough.
  let res = '';
  inStr = false;
  quote = '';
  esc = false;
  for (let i = 0; i < out.length; i++) {
    const c = out[i];
    if (inStr) {
      res += c;
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      res += c;
      continue;
    }
    if (c === ',') {
      let j = i + 1;
      while (j < out.length && isWs(out[j])) j++;
      if (out[j] === '}' || out[j] === ']') continue; // trailing comma -> drop
    }
    res += c;
  }
  return res;
}

export type Detected =
  | { readonly kind: 'config'; readonly servers: ScannedServer[] }
  | { readonly kind: 'tools'; readonly tools: ToolDef[] }
  | { readonly kind: 'unknown' };

/** Sniff which grade of input this is and route it. A tools dump wins when it
 * clearly carries tool schemas; otherwise a config; otherwise unknown. */
export function detectInput(root: unknown): Detected {
  const hasToolsShape =
    (isObj(root) &&
      (Array.isArray(root['tools']) ||
        (isObj(root['result']) && Array.isArray((root['result'] as Record<string, unknown>)['tools'])))) ||
    (Array.isArray(root) && root.length > 0 && isObj(root[0]) && 'inputSchema' in (root[0] as object));

  if (hasToolsShape) {
    const tools = parseToolsList(root);
    if (tools.length > 0) return { kind: 'tools', tools };
  }
  const servers = parseConfig(root);
  if (servers.length > 0) return { kind: 'config', servers };
  const tools = parseToolsList(root);
  if (tools.length > 0) return { kind: 'tools', tools };
  return { kind: 'unknown' };
}
