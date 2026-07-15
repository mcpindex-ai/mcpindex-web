/**
 * Single source of truth for every way to install mcpindex.
 *
 * WHY this exists: install commands were duplicated across /#install,
 * /docs, the per-server rail, GateInstallBridge and llms.txt, so the same
 * string had to be hand-synced in five places. The /install page, and later
 * the machine surfaces, render from HERE so the command a human copies and
 * the command an LLM cites are the same string.
 *
 * Honesty invariant (brand-binding): the GATE does deterministic contract-diff
 * in-path; it flags changes, it is not a safety verdict. The DIRECTORY server
 * is advisory (`calibrated=false`) and never sits in the call path. Copy in
 * this file must not claim otherwise.
 */

export const PACKAGES = {
  /** In-path gate binary (curl / uv / pip). The product / the wedge. */
  gateBinary: 'mcpindex-gate',
  /** TypeScript SDK for embedding the pin in your own server. */
  sdkTs: '@mcp-index/sdk',
  /** Advisory directory client (a normal single MCP server). */
  directoryServer: 'mcp-server-mcpindex',
  /** Docker MCP Registry image (build/sign pending review, PR #4441). */
  dockerImage: 'mcp/mcpindex',
  /** Official MCP Registry name (live). */
  registryName: 'io.github.gautamgb/mcp-server-mcpindex',
  installScript: 'https://mcpindex.ai/install.sh',
} as const;

/** The npx invocation the directory server runs under in every host config. */
export const DIRECTORY_COMMAND = 'npx';
export const DIRECTORY_ARGS = ['-y', `${PACKAGES.directoryServer}@latest`] as const;

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
    command: `curl -fsSL ${PACKAGES.installScript} | sh`,
    note: 'Installs the gate and wires your MCP hosts to route tool calls through it. Restarts the host after wiring.',
    track: 'install-page-gate-curl',
  },
  {
    id: 'inspect',
    label: 'Read it first',
    command: `curl -fsSL ${PACKAGES.installScript} | less`,
    note: 'Pipe to less to read the script before you run it. uninstall.sh restores the original config.',
    track: 'install-page-gate-inspect',
  },
  {
    id: 'uv',
    label: 'uv (auditable)',
    command: `uv tool install ${PACKAGES.gateBinary}`,
    note: 'Install the binary yourself, then run the wiring wizard. No pipe-to-shell.',
    track: 'install-page-gate-uv',
  },
  {
    id: 'pip',
    label: 'pip',
    command: `pip install ${PACKAGES.gateBinary}`,
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
    value: `claude mcp add --scope user mcpindex -- ${DIRECTORY_COMMAND} ${DIRECTORY_ARGS.join(' ')}`,
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    kind: 'command',
    value: `gemini mcp add -s user mcpindex ${DIRECTORY_COMMAND} ${DIRECTORY_ARGS.join(' ')}`,
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
    value: `${DIRECTORY_COMMAND} ${DIRECTORY_ARGS.join(' ')}`,
  },
];

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
  { surface: 'Gate (in-path)', method: 'Install script', command: `curl -fsSL ${PACKAGES.installScript} | sh` },
  { surface: 'Gate (in-path)', method: 'uv', command: `uv tool install ${PACKAGES.gateBinary}` },
  { surface: 'Gate (in-path)', method: 'pip', command: `pip install ${PACKAGES.gateBinary}` },
  { surface: 'Gate (in-path)', method: 'SDK (TypeScript)', command: `npm i ${PACKAGES.sdkTs}` },
  { surface: 'Directory (advisory)', method: 'npx', command: `${DIRECTORY_COMMAND} ${DIRECTORY_ARGS.join(' ')}` },
  { surface: 'Directory (advisory)', method: 'Claude Code', command: `claude mcp add --scope user mcpindex -- ${DIRECTORY_COMMAND} ${DIRECTORY_ARGS.join(' ')}` },
  { surface: 'Directory (advisory)', method: 'Gemini CLI', command: `gemini mcp add -s user mcpindex ${DIRECTORY_COMMAND} ${DIRECTORY_ARGS.join(' ')}` },
  { surface: 'Directory (advisory)', method: 'MCP Registry', command: PACKAGES.registryName },
  { surface: 'Directory (advisory)', method: 'Docker', command: `docker mcp gateway run  # image ${PACKAGES.dockerImage}`, pending: 'Image build/sign under review (docker/mcp-registry#4441).' },
  { surface: 'Web (no install)', method: 'Scan your config', command: 'https://mcpindex.ai/scan' },
  { surface: 'Web (no install)', method: 'Screen a server', command: 'https://mcpindex.ai/screen' },
];
