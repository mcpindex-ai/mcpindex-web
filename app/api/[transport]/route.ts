// Remote MCP server for mcpindex, exposed over Streamable HTTP at
// https://mcpindex.ai/api/mcp. Lets any agent/IDE connect to mcpindex's tools
// without installing anything, and lets remote-MCP directories (Smithery, etc.)
// register + scan a hosted URL. (A /mcp rewrite was dropped: mcp-handler's
// basePath must match the served path, so the canonical URL is /api/mcp.)
//
// This is a THIN protocol adapter over the existing public /api/v1 REST API -
// exactly what the stdio CLI (mcp-server-mcpindex/src/index.mjs) is. The tools
// fetch /api/v1/* and format the JSON; the REST routes stay the single source of
// truth (no logic duplication). The CLI package is untouched (stays single-dep).

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

// Same convention as the CLI: query the public API. The tools call /api/v1/*
// only (never /api/mcp), so there is no self-recursion.
const API_BASE = process.env.MCPINDEX_API_BASE || 'https://mcpindex.ai';

/* eslint-disable @typescript-eslint/no-explicit-any -- thin adapter over external JSON */

async function api(path: string): Promise<any> {
  // 8s per-fetch timeout so a slow upstream can't hold the (unauthenticated)
  // serverless invocation open up to maxDuration, esp. under compare_servers fan-out.
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': 'mcpindex-remote-mcp/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  // Status only - never echo the upstream body (avoids surfacing a verbose 5xx to callers).
  if (!res.ok) throw new Error(`mcpindex API ${res.status}`);
  return res.json();
}

// Defense-in-depth: the base host is fixed, but keep path-segment inputs from
// walking the /api/v1 path (reject traversal / control chars). Block-list, not
// allow-list, so we never reject a legitimate slug/tool name.
function safeSeg(v: string, label: string): string {
  if (!v || v === '.' || v.includes('/') || v.includes('\\') || v.includes('..') || /[\u0000-\u001f]/.test(v)) {
    throw new Error(`invalid ${label}`);
  }
  return v;
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
const errText = (name: string, e: unknown) => ({
  isError: true,
  content: [
    { type: 'text' as const, text: `Error calling ${name}: ${e instanceof Error ? e.message : String(e)}` },
  ],
});

// --- formatters ported from the CLI (mcp-server-mcpindex/src/index.mjs) ---

function formatRecommend(data: any): string {
  const lines = [`Top ${data.recommendations.length} for: "${data.task}"`, ''];
  for (const r of data.recommendations) {
    lines.push(`[${r.rank}] ${r.title}  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`    ${r.name}`);
    lines.push(`    ${r.reasoning}`);
    const i = r.installs ?? {};
    const install = i.npm
      ? `npx -y ${i.npm}`
      : i.pypi
        ? `uvx ${i.pypi}`
        : i.docker
          ? `docker run --rm -i ${i.docker}`
          : i.remote
            ? `Remote: ${i.remote}`
            : 'manual install - see detail page';
    lines.push(`    $ ${install}`);
    lines.push(`    ${r.url}`);
    lines.push('');
  }
  lines.push(`Source: ${data.note ?? ''}`);
  return lines.join('\n');
}

function formatSearch(data: any): string {
  const lines = [`${data.total} results for: "${data.query}"`, ''];
  for (const r of data.results) {
    lines.push(`- ${r.title}  (${r.name})  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`  ${r.description}`);
    lines.push(`  ${r.url ?? `https://mcpindex.ai/server/${r.slug}`}`);
  }
  return lines.join('\n');
}

function formatInstall(server: any, client: string): string {
  const target = (server.installs ?? []).find((x: any) => x.client === client) ?? server.installs?.[0];
  if (!target) return `No install path available for ${server.name}`;
  return [
    `${server.title} (${server.name}) - ${client}`,
    '',
    target.json ? '```json\n' + target.json + '\n```' : '```bash\n' + target.command + '\n```',
    target.notes ? '\n' + target.notes : '',
    `\n${server.url ?? `https://mcpindex.ai/server/${server.slug}`}`,
  ].join('\n');
}

function formatCompare(rows: any[]): string {
  const header = ['name', 'category', 'quality', 'install', 'env vars'];
  const data = rows.map((r) => [
    String(r.name ?? ''),
    String(r.category ?? ''),
    String(r.qualityScore ?? ''),
    String(r.installs?.[0]?.label ?? 'manual'),
    String(r.envVars?.length ?? 0),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...data.map((row) => row[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [fmt(header), fmt(widths.map((w) => '-'.repeat(w))), ...data.map(fmt)].join('\n');
}

const CLIENTS = ['claude-desktop', 'claude-code', 'cursor', 'gemini-cli', 'cline', 'zed'] as const;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'recommend_mcp_for_task',
      {
        title: 'Recommend MCP servers for a task',
        description:
          'Recommend the best MCP servers for a natural-language task. Returns top 3 ranked picks with reasoning, install commands, and quality scores. Use this when the user asks for the right MCP server for a task they want to do.',
        inputSchema: {
          task: z.string().describe('Natural-language description of the task, e.g. "read PDFs and write to S3".'),
        },
      },
      async ({ task }) => {
        try {
          return text(formatRecommend(await api(`/api/v1/recommend?task=${encodeURIComponent(task)}`)));
        } catch (e) {
          return errText('recommend_mcp_for_task', e);
        }
      },
    );

    server.registerTool(
      'search_mcp_servers',
      {
        title: 'Search MCP servers',
        description:
          'Keyword + semantic search across the full MCP server registry. Use when the user knows what tool category they want but not which server.',
        inputSchema: {
          query: z.string().describe('Search query.'),
          category: z.string().optional().describe('Optional category filter (e.g. database, browser, github).'),
          limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10, max 50).'),
        },
      },
      async ({ query, category, limit }) => {
        try {
          const params = new URLSearchParams({ q: query, limit: String(Math.min(50, limit ?? 10)) });
          if (category) params.set('category', category);
          return text(formatSearch(await api(`/api/v1/search?${params.toString()}`)));
        } catch (e) {
          return errText('search_mcp_servers', e);
        }
      },
    );

    server.registerTool(
      'get_install_command',
      {
        title: 'Get install command',
        description:
          'Get the exact install command for a given MCP server and client. Returns a JSON block ready to paste into the client config.',
        inputSchema: {
          server_slug: z.string().describe('Slug of the server (from search or recommend results).'),
          client: z.enum(CLIENTS).describe('Target client.'),
        },
      },
      async ({ server_slug, client }) => {
        try {
          return text(
            formatInstall(await api(`/api/v1/server/${encodeURIComponent(safeSeg(server_slug, 'server_slug'))}`), client),
          );
        } catch (e) {
          return errText('get_install_command', e);
        }
      },
    );

    server.registerTool(
      'compare_servers',
      {
        title: 'Compare MCP servers',
        description:
          'Side-by-side comparison of 2-5 MCP servers - quality scores, install paths, transport types, env vars.',
        inputSchema: {
          slugs: z.array(z.string()).min(2).max(5).describe('Server slugs to compare.'),
        },
      },
      async ({ slugs }) => {
        try {
          const rows = await Promise.all(
            slugs.map((s) => api(`/api/v1/server/${encodeURIComponent(safeSeg(s, 'slug'))}`)),
          );
          return text(formatCompare(rows));
        } catch (e) {
          return errText('compare_servers', e);
        }
      },
    );

    server.registerTool(
      'check_tool_trust',
      {
        title: 'Check tool trust (advisory)',
        description:
          'Pre-invocation advisory screen for a specific tool on an MCP server. Returns an advisory verdict object (directive ALLOW | DENY | REVIEW | UNVERIFIED, dimensions, freshness). At v1 the public screen produces REVIEW or UNVERIFIED only - ALLOW/DENY are reserved. Not the in-path gate. Agents SHOULD treat UNVERIFIED as "human review required", never as ALLOW.',
        inputSchema: {
          server_id: z.string().describe('Server slug (e.g. "github").'),
          tool_name: z.string().describe('Tool name as exposed by the server (e.g. "create_pull_request").'),
        },
      },
      async ({ server_id, tool_name }) => {
        try {
          const v = await api(
            `/api/v1/trust/tool/${encodeURIComponent(safeSeg(server_id, 'server_id'))}/${encodeURIComponent(safeSeg(tool_name, 'tool_name'))}`,
          );
          return text(JSON.stringify(v, null, 2));
        } catch (e) {
          return errText('check_tool_trust', e);
        }
      },
    );

    server.registerTool(
      'assess_server',
      {
        title: 'Assess server trust (advisory)',
        description:
          'Aggregated pre-flight trust assessment across all tools on an MCP server. Same verdict shape as check_tool_trust. v1 advisory; conformance monitored not enforced; verdicts may be UNVERIFIED if not yet probed.',
        inputSchema: {
          server_id: z.string().describe('Server slug to assess.'),
        },
      },
      async ({ server_id }) => {
        try {
          const v = await api(`/api/v1/trust/server/${encodeURIComponent(safeSeg(server_id, 'server_id'))}`);
          return text(JSON.stringify(v, null, 2));
        } catch (e) {
          return errText('assess_server', e);
        }
      },
    );
  },
  {
    serverInfo: { name: 'mcpindex', version: '1.0.0' },
    capabilities: { tools: {} },
  },
  {
    basePath: '/api', // matches app/api/[transport]/route.ts -> /api/mcp
    maxDuration: 30,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
