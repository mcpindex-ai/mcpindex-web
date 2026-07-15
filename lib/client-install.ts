/**
 * Cold-install copy constants.
 * Gate one-liner shell remains INSTALL_SHELL_COMMAND in lib/install-command.ts.
 */

/** Canonical PyPI package for the in-path gate. */
export const GATE_PACKAGE = 'mcpindex-gate';

export const GATE_UV_INSTALL = `uv tool install ${GATE_PACKAGE}`;

export const DISCOVERY_PACKAGE = 'mcp-server-mcpindex';

export const DISCOVERY_NPM_GLOBAL = `npm install -g ${DISCOVERY_PACKAGE}`;

/** Claude Code - user scope so it is available outside one project. */
export const DISCOVERY_CLAUDE_MCP_ADD =
  'claude mcp add --scope user mcpindex -- npx -y mcp-server-mcpindex@latest';

/** Gemini CLI - user scope. */
export const DISCOVERY_GEMINI_MCP_ADD =
  'gemini mcp add -s user mcpindex npx -y mcp-server-mcpindex@latest';

/** Hosts the gate auto-wires via install.sh / config_scan (honest marketing list). */
export const GATE_HOSTS_SHORT =
  'Claude Desktop, Claude Code, Cursor, Gemini CLI, Cline, and Zed';

export const GATE_HOSTS_DOCS =
  'Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed';
