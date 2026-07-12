/**
 * Cold-install copy for the advisory directory MCP client (not the in-path gate).
 * Gate remains INSTALL_SHELL_COMMAND in lib/install-command.ts.
 */

export const DISCOVERY_PACKAGE = 'mcp-server-mcpindex';

export const DISCOVERY_NPM_GLOBAL = `npm install -g ${DISCOVERY_PACKAGE}`;

/** Claude Code — user scope so it is available outside one project. */
export const DISCOVERY_CLAUDE_MCP_ADD =
  'claude mcp add --scope user mcpindex -- npx -y mcp-server-mcpindex@latest';

/** Gemini CLI — user scope. */
export const DISCOVERY_GEMINI_MCP_ADD =
  'gemini mcp add -s user mcpindex npx -y mcp-server-mcpindex@latest';

/** Hosts the gate auto-wires via install.sh / config_scan (honest marketing list). */
export const GATE_HOSTS_SHORT =
  'Claude Desktop, Claude Code, Cursor, Gemini CLI, Cline, and Zed';

export const GATE_HOSTS_DOCS =
  'Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed';
