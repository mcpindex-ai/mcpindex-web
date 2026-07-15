/**
 * Cold-install copy constants for the homepage and install CTAs.
 *
 * The COMMANDS re-export SCALAR values from lib/install/manifest.ts (one
 * authoritative value, so a rename can't leave the homepage and /install
 * disagreeing). Importing the scalars (not the GATE_METHODS / DIRECTORY_CLIENTS
 * arrays) keeps this module's client consumers (InstallCtaButton) from pulling
 * the install-method prose and the Buffer deep-link code into the browser.
 */
import {
  PACKAGES,
  UV_INSTALL,
  NPM_GLOBAL_INSTALL,
  CLAUDE_MCP_ADD,
  GEMINI_MCP_ADD,
} from './install/commands';

/** Canonical PyPI package for the in-path gate. */
export const GATE_PACKAGE = PACKAGES.gateBinary;

export const GATE_UV_INSTALL = UV_INSTALL;

export const DISCOVERY_PACKAGE = PACKAGES.directoryServer;

export const DISCOVERY_NPM_GLOBAL = NPM_GLOBAL_INSTALL;

/** Claude Code - user scope so it is available outside one project. */
export const DISCOVERY_CLAUDE_MCP_ADD = CLAUDE_MCP_ADD;

/** Gemini CLI - user scope. */
export const DISCOVERY_GEMINI_MCP_ADD = GEMINI_MCP_ADD;

/**
 * Trimmed marketing host list for the homepage: a deliberate 6-of-8 subset of
 * the most common hosts. The COMPLETE gate host set is GATE_WIRING_HOSTS in
 * lib/install/manifest.ts, used on the machine surfaces (llms.txt) where an LLM
 * reads the list as exhaustive - so completeness matters there, brevity here.
 * Every host named here MUST be in GATE_WIRING_HOSTS (a subset test enforces it),
 * so the homepage never claims a host the gate does not actually wire.
 */
export const GATE_HOSTS_SHORT =
  'Claude Desktop, Claude Code, Cursor, Gemini CLI, Cline, and Zed';

export const GATE_HOSTS_DOCS =
  'Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed';
