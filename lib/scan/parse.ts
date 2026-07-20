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
function redactUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return scrubFreeText(raw);
  }
  if (u.username || u.password) {
    u.username = MASK;
    u.password = '';
  }
  for (const k of [...u.searchParams.keys()]) {
    const v = u.searchParams.get(k) ?? '';
    if (QUERY_SECRET_RE.test(k) || looksLikeSecretToken(v)) u.searchParams.set(k, MASK);
  }
  u.pathname = u.pathname
    .split('/')
    .map((seg) => (looksLikeSecretToken(seg) ? MASK : seg))
    .join('/');
  return u.toString();
}

/** Redact command args POSITIONALLY, before joining. Joining first is what made
 * `--api-key sk-live-…` unmaskable: once flattened, only a `=` separator is left to
 * key off, and the space-separated form is the more common one in real configs. */
function redactArgs(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = a.indexOf('=');
    if (eq > 0 && FLAG_SECRET_RE.test(a.slice(0, eq))) {
      out.push(`${a.slice(0, eq + 1)}${MASK}`); // --api-key=VALUE
      continue;
    }
    // A path is never a credential, and paths are the most common long arg
    // (`/Volumes/…`, `@scope/pkg`), so shape-matching skips them.
    const pathish = a.includes('/') || a.includes('\\');
    out.push(!pathish && looksLikeSecretToken(a) ? MASK : a);
    // --api-key VALUE : the secret is the NEXT token. A following flag is not a value.
    if (FLAG_SECRET_RE.test(a) && eq === -1 && i + 1 < args.length && !args[i + 1].startsWith('-')) {
      out.push(MASK);
      i++;
    }
  }
  return out;
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

/** Secret-looking key names across BOTH credential locations. Remote servers
 * authenticate via `headers`, so an env-only scan called them clean. Key names
 * only - values are never returned. */
function secretKeys(def: Record<string, unknown>): string[] {
  return [
    ...secretKeysIn(def['env'], '', (k) => SECRET_KEY_RE.test(k)),
    ...secretKeysIn(
      def['headers'],
      'header:',
      (k, v) =>
        SECRET_KEY_RE.test(k) || AUTH_HEADER_RE.test(k) || (typeof v === 'string' && AUTH_VALUE_RE.test(v)),
    ),
  ];
}

/** Loopback hosts are exempt from the plaintext finding - traffic never leaves
 * the machine, and `http://localhost` is the normal way to run a local server. */
function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  // Fully anchored: an unanchored /^127\./ would treat the registrable domain
  // `127.0.0.1.evil.com` as loopback and suppress the plaintext finding on an
  // attacker-controlled host. `.localhost` is reserved (RFC 6761), not delegated.
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '::1' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
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
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'ws:') && !isLoopbackHost(u.hostname);
  } catch {
    return false;
  }
}

function commandString(def: Record<string, unknown>): string | null {
  if (typeof def['command'] !== 'string') return null;
  // Stringify non-string args as JSON (not "[object Object]") so embedded text stays legible.
  const args = Array.isArray(def['args'])
    ? def['args'].map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    : [];
  return redactArgs([def['command'] as string, ...args]).join(' ').trim();
}

/** Normalize a pasted MCP config into a server inventory. Total. */
export function parseConfig(root: unknown): ScannedServer[] {
  const map = serverMap(root);
  if (!map) return [];
  const out: ScannedServer[] = [];
  for (const [name, defRaw] of Object.entries(map)) {
    if (!isObj(defRaw)) continue;
    out.push({
      name: String(name),
      transport: transportOf(defRaw),
      url: typeof defRaw['url'] === 'string' ? redactUrl(defRaw['url'] as string) : null,
      command: commandString(defRaw),
      secretKeys: secretKeys(defRaw),
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
