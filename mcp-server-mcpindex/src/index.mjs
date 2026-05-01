#!/usr/bin/env node
// mcp-server-mcpindex — an MCP server for finding MCP servers.
// Backend: api.mcpindex.ai (versioned, free tier — no key needed for v0).

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.MCPINDEX_API_BASE ?? 'https://mcpindex.ai';

const server = new Server(
  { name: 'mcp-server-mcpindex', version: '0.1.0' },
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
          enum: ['claude-desktop', 'cursor', 'cline', 'zed'],
          description: 'Target client.',
        },
      },
      required: ['server_slug', 'client'],
    },
  },
  {
    name: 'compare_servers',
    description:
      'Side-by-side comparison of 2-5 MCP servers — quality scores, install paths, transport types, env vars.',
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
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': 'mcp-server-mcpindex/0.1.0' },
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
            : 'manual install — see detail page';
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
    `${server.title} (${server.name}) — ${client}`,
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
