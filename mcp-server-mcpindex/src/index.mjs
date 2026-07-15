#!/usr/bin/env node
// mcp-server-mcpindex - an MCP server for finding MCP servers.
// Backend: api.mcpindex.ai (versioned, free tier - no key needed for v0).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createRequire } from 'node:module';
export { checkToolTrust, assessServer, VERDICT_CONTRACT_VERSION, V1_HONEST_LIMITS } from './trust.mjs';
import { notifyUpdateIfAvailable } from './update-check.mjs';

const API_BASE = process.env.MCPINDEX_API_BASE ?? 'https://mcpindex.ai';
// Single source of truth for the running version - read from package.json so the
// User-Agent and the update-check can never drift from what npm actually shipped.
const PKG_VERSION = createRequire(import.meta.url)('../package.json').version;

const server = new Server(
  { name: 'mcp-server-mcpindex', version: PKG_VERSION },
  // Tools only. We do NOT advertise `logging`: the update notice goes to stderr (which
  // every host surfaces), not via `notifications/message` (rendered inconsistently - Cursor
  // logs it as a bare ` undefined`). stderr is the universal, clean channel.
  { capabilities: { tools: {} } },
);

const TOOLS = [
  {
    name: 'recommend_mcp_for_task',
    description:
      'Recommend the best MCP servers for a natural-language task. Returns top 3 ranked picks with reasoning, install commands, and quality scores. Use this when the user asks for the right MCP server for a task they want to do.',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'Natural-language description of the task, e.g. "read PDFs and write to S3" or "search GitHub and open a PR".',
        },
      },
      required: ['task'],
    },
  },
  {
    name: 'search_mcp_servers',
    description:
      'Keyword + semantic search across the full MCP server registry. Use when the user knows what tool category they want but not which server.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
        category: {
          type: 'string',
          description:
            'Optional category filter (e.g. database, browser, github, productivity).',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10, max 50).',
          default: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_install_command',
    description:
      'Get the exact install command for a given MCP server and client. Returns a JSON block ready to paste into the client config.',
    inputSchema: {
      type: 'object',
      properties: {
        server_slug: {
          type: 'string',
          description:
            'Slug of the server (from search_mcp_servers or recommend_mcp_for_task results).',
        },
        client: {
          type: 'string',
          enum: ['claude-desktop', 'claude-code', 'cursor', 'gemini-cli', 'cline', 'zed'],
          description: 'Target client.',
        },
      },
      required: ['server_slug', 'client'],
    },
  },
  {
    name: 'compare_servers',
    description:
      'Side-by-side comparison of 2-5 MCP servers - quality scores, install paths, transport types, env vars.',
    inputSchema: {
      type: 'object',
      properties: {
        slugs: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 5,
          description: 'Server slugs to compare.',
        },
      },
      required: ['slugs'],
    },
  },
  {
    name: 'check_tool_trust',
    description:
      'Pre-invocation advisory screen for a specific tool on an MCP server. Returns an advisory verdict object (directive ALLOW | DENY | REVIEW | UNVERIFIED, dimensions, freshness). At v1 the public screen produces REVIEW or UNVERIFIED only - ALLOW/DENY are reserved. Not the in-path gate (mcpindex-gate). Agents SHOULD treat UNVERIFIED as "human review required", never as ALLOW.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: {
          type: 'string',
          description: 'Server slug (e.g. "github", "filesystem"). Same id used by search_mcp_servers.',
        },
        tool_name: {
          type: 'string',
          description: 'Tool name as exposed by the server (e.g. "create_pull_request").',
        },
      },
      required: ['server_id', 'tool_name'],
    },
  },
  {
    name: 'assess_server',
    description:
      'Aggregated pre-flight trust assessment across all tools on an MCP server. Same verdict shape as check_tool_trust. Use for "is THIS server worth integrating?" decisions. v1 advisory; conformance monitored not enforced; verdicts may be UNVERIFIED if not yet probed.',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: {
          type: 'string',
          description: 'Server slug to assess.',
        },
      },
      required: ['server_id'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': `mcp-server-mcpindex/${PKG_VERSION}` },
  });
  if (!res.ok) {
    throw new Error(`mcpindex API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result;
    switch (name) {
      case 'recommend_mcp_for_task': {
        const data = await api(
          `/api/v1/recommend?task=${encodeURIComponent(args.task)}`,
        );
        result = formatRecommend(data);
        break;
      }
      case 'search_mcp_servers': {
        const params = new URLSearchParams({
          q: args.query,
          limit: String(Math.min(50, args.limit ?? 10)),
        });
        if (args.category) params.set('category', args.category);
        const data = await api(`/api/v1/search?${params.toString()}`);
        result = formatSearch(data);
        break;
      }
      case 'get_install_command': {
        const data = await api(`/api/v1/server/${encodeURIComponent(args.server_slug)}`);
        result = formatInstall(data, args.client);
        break;
      }
      case 'compare_servers': {
        const rows = await Promise.all(
          args.slugs.map((s) => api(`/api/v1/server/${encodeURIComponent(s)}`)),
        );
        result = formatCompare(rows);
        break;
      }
      case 'check_tool_trust': {
        const { checkToolTrust } = await import('./trust.mjs');
        const verdict = await checkToolTrust({
          serverId: args.server_id,
          toolName: args.tool_name,
          apiBase: API_BASE,
          userAgent: `mcp-server-mcpindex/${PKG_VERSION}`,
        });
        result = JSON.stringify(verdict, null, 2);
        break;
      }
      case 'assess_server': {
        const { assessServer } = await import('./trust.mjs');
        const verdict = await assessServer({
          serverId: args.server_id,
          apiBase: API_BASE,
          userAgent: `mcp-server-mcpindex/${PKG_VERSION}`,
        });
        result = JSON.stringify(verdict, null, 2);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error calling ${name}: ${err instanceof Error ? err.message : err}`,
        },
      ],
    };
  }
});

function formatRecommend(data) {
  const lines = [`Top ${data.recommendations.length} for: "${data.task}"`, ''];
  for (const r of data.recommendations) {
    lines.push(`[${r.rank}] ${r.title}  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`    ${r.name}@${r.qualityScore ? '' : ''}`);
    lines.push(`    ${r.reasoning}`);
    const install = r.installs.npm
      ? `npx -y ${r.installs.npm}`
      : r.installs.pypi
        ? `uvx ${r.installs.pypi}`
        : r.installs.docker
          ? `docker run --rm -i ${r.installs.docker}`
          : r.installs.remote
            ? `Remote: ${r.installs.remote}`
            : 'manual install - see detail page';
    lines.push(`    $ ${install}`);
    lines.push(`    ${r.url}`);
    lines.push('');
  }
  lines.push(`Source: ${data.note ?? ''}`);
  return lines.join('\n');
}

function formatSearch(data) {
  const lines = [`${data.total} results for: "${data.query}"`, ''];
  for (const r of data.results) {
    lines.push(`- ${r.title}  (${r.name})  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`  ${r.description}`);
    lines.push(`  ${r.url}`);
  }
  return lines.join('\n');
}

function formatInstall(server, client) {
  // server here is the per-server JSON we expose at /api/v1/server/<slug>.
  // Returns a code block with the appropriate install snippet.
  const target = (server.installs ?? []).find((i) => i.client === client) ?? server.installs?.[0];
  if (!target) return `No install path available for ${server.name}`;
  return [
    `${server.title} (${server.name}) - ${client}`,
    '',
    target.json
      ? '```json\n' + target.json + '\n```'
      : '```bash\n' + target.command + '\n```',
    target.notes ? '\n' + target.notes : '',
    `\n${server.url ?? `https://mcpindex.ai/server/${server.slug}`}`,
  ].join('\n');
}

function formatCompare(rows) {
  const header = ['name', 'category', 'quality', 'install', 'env vars'];
  const data = rows.map((r) => [
    r.name,
    r.category,
    String(r.qualityScore ?? ''),
    r.installs?.[0]?.label ?? 'manual',
    String(r.envVars?.length ?? 0),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...data.map((row) => row[i].length)),
  );
  const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [fmt(header), fmt(widths.map((w) => '-'.repeat(w))), ...data.map(fmt)].join('\n');
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[mcp-server-mcpindex] connected via stdio');

// Fire-and-forget: tell the user if a newer version exists (stderr only - the channel
// every host renders cleanly). Dropped onto the event loop AFTER connect so it can never
// delay or crash startup; all errors are swallowed inside.
notifyUpdateIfAvailable({ currentVersion: PKG_VERSION }).catch(() => {});
