/**
 * Source of truth for install COMMANDS on mcpindex.
 *
 * The /install page, llms.txt and llms-full.txt render their commands from
 * here, and the homepage / CTA command constants (lib/install-command.ts and
 * lib/client-install.ts) re-export from here, so the string a human copies and
 * the string an LLM cites are one value. (app/docs and app/.well-known still
 * carry their own literals; folding them in is a later pass.)
 *
 * Honesty invariant (brand-binding): the GATE does deterministic contract-diff
 * in-path; it flags changes, it is not a safety verdict. The DIRECTORY server
 * is advisory (`calibrated=false`) and never sits in the call path. Copy in
 * this file must not claim otherwise.
 */

// Scalar command primitives live in the client-safe leaf module. Client-facing
// re-export files (lib/install-command.ts, lib/client-install.ts) import from
// './commands' directly, so they never pull this module's arrays / deep-link
// code into the browser. Re-exported here for server consumers (the /install
// page, tests) that already import them from the manifest.
import {
  PACKAGES,
  DIRECTORY_COMMAND,
  DIRECTORY_ARGS,
  CURL_INSTALL,
  INSPECT_INSTALL,
  UV_INSTALL,
  PIP_INSTALL,
  DIRECTORY_NPX,
  CLAUDE_MCP_ADD,
  GEMINI_MCP_ADD,
} from './commands';

export * from './commands';

// --- Gate install methods (the product) --------------------------------------

export type GateMethod = {
  id: string;
  label: string;
  command: string;
  /** One honest line on what this path is / when to pick it. */
  note: string;
  /** trackSource for CopyField -> gate_install_copy analytics. */
  track: string;
};

export const GATE_METHODS: GateMethod[] = [
  {
    id: 'curl',
    label: 'One-liner (all hosts)',
    command: CURL_INSTALL,
    note: 'Installs the gate and wires your MCP hosts to route tool calls through it. Restarts the host after wiring.',
    track: 'install-page-gate-curl',
  },
  {
    id: 'inspect',
    label: 'Read it first',
    command: INSPECT_INSTALL,
    note: 'Pipe to less to read the script before you run it. uninstall.sh restores the original config.',
    track: 'install-page-gate-inspect',
  },
  {
    id: 'uv',
    label: 'uv (auditable)',
    command: UV_INSTALL,
    note: 'Install the binary yourself, then run the wiring wizard. No pipe-to-shell.',
    track: 'install-page-gate-uv',
  },
  {
    id: 'pip',
    label: 'pip',
    command: PIP_INSTALL,
    note: 'Same binary from PyPI if you would rather not add uv.',
    track: 'install-page-gate-pip',
  },
];

/** Embed the pin in your own server instead of running the standalone gate. */
export const SDK_SNIPPET_TS = `npm i ${PACKAGES.sdkTs}
// then, in your server:
import { wrap, PreflightPin } from "${PACKAGES.sdkTs}";
const guarded = wrap(session, { pin: new PreflightPin(), serverId: "your-server" });`;

// --- Directory server: per-client install (advisory) -------------------------

export type DirectoryClient = {
  id: string;
  label: string;
  /** 'command' = paste-and-run CLI; 'config' = JSON to drop in a file. */
  kind: 'command' | 'config';
  value: string;
  /** Config-file location for kind === 'config'. */
  path?: string;
};

/** The mcpServers JSON block hosts share (Cursor, Zed, Claude Desktop, ...). */
export const DIRECTORY_CONFIG_JSON = JSON.stringify(
  { mcpServers: { mcpindex: { command: DIRECTORY_COMMAND, args: [...DIRECTORY_ARGS] } } },
  null,
  2,
);

export const DIRECTORY_CLIENTS: DirectoryClient[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'command',
    value: CLAUDE_MCP_ADD,
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    kind: 'command',
    value: GEMINI_MCP_ADD,
  },
  {
    id: 'cursor',
    label: 'Cursor',
    kind: 'config',
    path: '.cursor/mcp.json (project) or ~/.cursor/mcp.json (global)',
    value: DIRECTORY_CONFIG_JSON,
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    kind: 'config',
    path: 'claude_desktop_config.json',
    value: DIRECTORY_CONFIG_JSON,
  },
  {
    id: 'zed',
    label: 'Zed',
    kind: 'config',
    path: '~/.config/zed/settings.json',
    value: DIRECTORY_CONFIG_JSON,
  },
  {
    id: 'cline',
    label: 'Cline',
    kind: 'config',
    path: 'cline_mcp_settings.json',
    value: DIRECTORY_CONFIG_JSON,
  },
  {
    id: 'raw',
    label: 'Any host (raw)',
    kind: 'command',
    value: DIRECTORY_NPX,
  },
];

// --- Machine surfaces (llms.txt / llms-full.txt derive from here) ------------

/** The frozen, do-not-use binary. Named only to steer users off it. */
export const LEGACY_EOL_PACKAGE = 'mcpindex-preflight';

/**
 * Hosts the GATE config-wires, for prose surfaces (llms.txt, llms-full.txt).
 * Authoritative source: mcpindex-trust/corpus_eval/tooling/cse/config_scan.py
 * `_default_config_paths()`. This is a SUPERSET of the directory picker
 * (DIRECTORY_CLIENTS): the gate also wires VS Code and Windsurf. Do NOT derive
 * it from the picker - that understates the gate on the machine surfaces, where
 * an LLM reads the list as the exhaustive capability set.
 *
 * PARITY (cross-repo, comment-enforced): this list mirrors a Python source in
 * another repo, so no build check can compare them. If you add/remove a host in
 * `_default_config_paths()`, update THIS list in the same change - and vice
 * versa (that function carries the reciprocal pointer). Getting them out of sync
 * makes llms.txt over- or under-state the gate. A shared committed JSON artifact
 * is the robust follow-up. The subset/superset tests in manifest.test.ts guard
 * the picker and the marketing list against THIS constant, not against Python.
 */
export const GATE_WIRING_HOSTS = [
  'Claude Desktop',
  'Claude Code',
  'Cursor',
  'VS Code',
  'Windsurf',
  'Cline',
  'Zed',
  'Gemini CLI',
] as const;

/**
 * Canonical one-line gate-install summary for llms.txt and llms-full.txt, so
 * the machine surfaces cite the SAME commands as the /install page instead of
 * a hand-synced copy. Pass code:true for markdown (backticked) surfaces.
 */
export function gateInstallLine({ code = false }: { code?: boolean } = {}): string {
  const cmd = (s: string) => (code ? `\`${s}\`` : s);
  return (
    `Install: one-click config-wire across ${GATE_WIRING_HOSTS.join(' / ')} via ${cmd(UV_INSTALL)} or ${cmd(CURL_INSTALL)} ` +
    `(rewrites the host config to route each server through the gate; zero credentials change hands), ` +
    `or the SDK wrap() one-liner (TS + Python) around an already-authenticated session. ` +
    `Legacy ${cmd(LEGACY_EOL_PACKAGE)} is EOL (frozen 0.7.0); install ${cmd(PACKAGES.gateBinary)}, not preflight. See /docs.`
  );
}

// --- One-click deep links (directory server only) ----------------------------
//
// A deep link adds ONE MCP server, which fits the directory server (a plain
// npx server). The gate rewrites host config, so it has no single-server deep
// link -> the gate uses its curl/uv flow above. This is honest, not a gap.

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/** cursor://anysphere.cursor-deeplink/mcp/install - adds the directory server. */
export function cursorDeepLink(): string {
  const config = { command: DIRECTORY_COMMAND, args: [...DIRECTORY_ARGS] };
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=mcpindex&config=${b64url(config)}`;
}

/** vscode:mcp/install - adds the directory server to VS Code. */
export function vscodeDeepLink(): string {
  const payload = { name: 'mcpindex', command: DIRECTORY_COMMAND, args: [...DIRECTORY_ARGS] };
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`;
}

// --- Full method matrix (AEO completeness) -----------------------------------

export type MethodRow = {
  surface: 'Gate (in-path)' | 'Directory (advisory)' | 'Web (no install)';
  method: string;
  command: string;
  /** Honest status when a path is not yet fully live. */
  pending?: string;
};

export const METHOD_MATRIX: MethodRow[] = [
  { surface: 'Gate (in-path)', method: 'Install script', command: CURL_INSTALL },
  { surface: 'Gate (in-path)', method: 'uv', command: UV_INSTALL },
  { surface: 'Gate (in-path)', method: 'pip', command: PIP_INSTALL },
  { surface: 'Gate (in-path)', method: 'SDK (TypeScript)', command: `npm i ${PACKAGES.sdkTs}` },
  { surface: 'Directory (advisory)', method: 'npx', command: DIRECTORY_NPX },
  { surface: 'Directory (advisory)', method: 'Remote (hosted, no install)', command: 'https://mcpindex.ai/api/mcp' },
  { surface: 'Directory (advisory)', method: 'Claude Code', command: CLAUDE_MCP_ADD },
  { surface: 'Directory (advisory)', method: 'Gemini CLI', command: GEMINI_MCP_ADD },
  { surface: 'Directory (advisory)', method: 'Mastra hook', command: `npm i ${PACKAGES.mastra}` },
  { surface: 'Directory (advisory)', method: 'MCP Registry', command: PACKAGES.registryName },
  { surface: 'Directory (advisory)', method: 'Docker', command: `docker mcp gateway run  # image ${PACKAGES.dockerImage}`, pending: 'Image build/sign under review (docker/mcp-registry#4441).' },
  { surface: 'Web (no install)', method: 'Scan your config', command: 'https://mcpindex.ai/scan' },
  { surface: 'Web (no install)', method: 'Screen a server', command: 'https://mcpindex.ai/screen' },
];
