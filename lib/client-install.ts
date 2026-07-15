/**
 * Cold-install copy constants for the homepage and install CTAs.
 *
 * The COMMANDS re-export from lib/install/manifest.ts (one authoritative value,
 * so a rename can't leave the homepage and /install disagreeing). Gate one-liner
 * shell remains INSTALL_SHELL_COMMAND in lib/install-command.ts (also derived).
 */
import { PACKAGES, GATE_METHODS, DIRECTORY_CLIENTS } from './install/manifest';

/** Canonical PyPI package for the in-path gate. */
export const GATE_PACKAGE = PACKAGES.gateBinary;

export const GATE_UV_INSTALL = GATE_METHODS.find((m) => m.id === 'uv')!.command;

export const DISCOVERY_PACKAGE = PACKAGES.directoryServer;

export const DISCOVERY_NPM_GLOBAL = `npm install -g ${PACKAGES.directoryServer}`;

/** Claude Code - user scope so it is available outside one project. */
export const DISCOVERY_CLAUDE_MCP_ADD = DIRECTORY_CLIENTS.find((c) => c.id === 'claude-code')!.value;

/** Gemini CLI - user scope. */
export const DISCOVERY_GEMINI_MCP_ADD = DIRECTORY_CLIENTS.find((c) => c.id === 'gemini')!.value;

/**
 * Trimmed marketing host list for the homepage: a deliberate 6-of-8 subset of
 * the most common hosts. The COMPLETE gate host set is GATE_WIRING_HOSTS in
 * lib/install/manifest.ts, used on the machine surfaces (llms.txt) where an LLM
 * reads the list as exhaustive - so completeness matters there, brevity here.
 */
export const GATE_HOSTS_SHORT =
  'Claude Desktop, Claude Code, Cursor, Gemini CLI, Cline, and Zed';

export const GATE_HOSTS_DOCS =
  'Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed';
