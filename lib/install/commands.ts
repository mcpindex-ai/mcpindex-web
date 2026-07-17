/**
 * Client-safe install command primitives.
 *
 * ONLY scalar strings and small constant objects live here - NO arrays of prose
 * (GATE_METHODS / DIRECTORY_CLIENTS / METHOD_MATRIX) and NO Buffer / deep-link
 * functions. Client components (the homepage install CTA) import from HERE via
 * lib/install-command.ts and lib/client-install.ts, NEVER from
 * lib/install/manifest.ts. That keeps the install-method arrays and the
 * Buffer-using deep-link code out of the browser bundle regardless of how the
 * bundler groups chunks.
 *
 * lib/install/manifest.ts imports these and BUILDS its arrays from them, so
 * there is still exactly one value per command.
 */

export const PACKAGES = {
  /** In-path gate binary (curl / uv / pip). The product / the wedge. */
  gateBinary: 'mcpindex-gate',
  /** TypeScript SDK for embedding the pin in your own server. */
  sdkTs: '@mcp-index/sdk',
  /** Advisory directory client (a normal single MCP server). */
  directoryServer: 'mcp-server-mcpindex',
  /** Mastra beforeToolCall hook over the advisory screen. */
  mastra: '@mcp-index/mastra',
  /** Docker MCP Registry image (build/sign pending review, PR #4441). */
  dockerImage: 'mcp/mcpindex',
  /** Official MCP Registry name (live). */
  registryName: 'io.github.gautamgb/mcp-server-mcpindex',
  installScript: 'https://mcpindex.ai/install.sh',
} as const;

/** The npx invocation the directory server runs under in every host config. */
export const DIRECTORY_COMMAND = 'npx';
export const DIRECTORY_ARGS = ['-y', `${PACKAGES.directoryServer}@latest`] as const;

export const CURL_INSTALL = `curl -fsSL ${PACKAGES.installScript} | sh`;
export const INSPECT_INSTALL = `curl -fsSL ${PACKAGES.installScript} | less`;
export const UV_INSTALL = `uv tool install ${PACKAGES.gateBinary}`;
export const PIP_INSTALL = `pip install ${PACKAGES.gateBinary}`;
export const NPM_GLOBAL_INSTALL = `npm install -g ${PACKAGES.directoryServer}`;
export const DIRECTORY_NPX = `${DIRECTORY_COMMAND} ${DIRECTORY_ARGS.join(' ')}`;
export const CLAUDE_MCP_ADD = `claude mcp add --scope user mcpindex -- ${DIRECTORY_NPX}`;
export const GEMINI_MCP_ADD = `gemini mcp add -s user mcpindex ${DIRECTORY_NPX}`;
