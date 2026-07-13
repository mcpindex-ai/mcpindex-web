// Pure, total parsers. Given already-parsed JSON (the component owns JSON.parse +
// its error), normalize into our data model. Never throw — hostile / malformed
// input resolves to an empty result, not an exception.

import type { ToolDef } from './vendor/preflight-types';
import type { ScannedServer, Transport } from './types';

// Secret-looking env KEY names. We report the key name, never the value.
// ('session' dropped: it over-matched SESSION_TIMEOUT/SESSION_ID; a real session
// secret still matches via token/secret.)
const SECRET_KEY_RE =
  /(^|[_-])(token|api[_-]?key|apikey|secret|password|passwd|bearer|credential|creds?|access[_-]?key|private[_-]?key|pat)($|[_-])/i;

// A secret-looking `key=value` (or `key: value`) segment inside a command string or
// URL query, so we can mask the VALUE before display and honor the "key names only"
// promise even when a token is passed as a CLI flag or query param.
const SECRET_ASSIGN_RE =
  /([\w.-]*(?:token|api[_-]?key|apikey|secret|password|passwd|bearer|credential|access[_-]?key|private[_-]?key|pat)[\w.-]*\s*[=:]\s*)(\S+)/gi;

/** Mask secret-looking values inside a free string (command args, URL query), and
 * drop URL userinfo. Display-only defense so a token passed as `--token=…` or
 * `?apikey=…` is never rendered even though the whole tool is client-side. */
function redactSecrets(s: string): string {
  return s
    .replace(/(\/\/)[^/@\s]*@/, '$1***@') // strip userinfo: https://user:pw@h -> https://***@h
    .replace(SECRET_ASSIGN_RE, '$1***');
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

function envSecretKeys(def: Record<string, unknown>): string[] {
  const env = def['env'];
  if (!isObj(env)) return [];
  return Object.keys(env).filter((k) => SECRET_KEY_RE.test(k));
}

function commandString(def: Record<string, unknown>): string | null {
  if (typeof def['command'] !== 'string') return null;
  // Stringify non-string args as JSON (not "[object Object]") so embedded text stays legible.
  const args = Array.isArray(def['args'])
    ? def['args'].map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    : [];
  return redactSecrets([def['command'] as string, ...args].join(' ').trim());
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
      url: typeof defRaw['url'] === 'string' ? redactSecrets(defRaw['url'] as string) : null,
      command: commandString(defRaw),
      envSecretKeys: envSecretKeys(defRaw),
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
 * `//` and block comments and trailing commas). Returns undefined on failure —
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
  // Pass 1 — strip comments (string-aware).
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
  // Pass 2 — drop trailing commas (a `,` whose next non-whitespace char is `}`/`]`),
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
