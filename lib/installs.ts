// Generate install commands per client. Best-effort — falls back to manual JSON
// when the registry entry doesn't expose a runnable package or URL.

import type { IndexedServer } from './types';

export type InstallTarget = {
  client: 'claude-desktop' | 'cursor' | 'cline' | 'zed' | 'remote';
  label: string;
  command?: string;
  json?: string;
  notes?: string;
};

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

  // Remote (HTTP/SSE) — preferred when available.
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
      command: `npx -y ${s.npmPackage}`,
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
