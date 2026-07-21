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

// In-process /api/v1 dispatch (no self-fetch); see lib/v1Dispatch.ts.
import { callV1 } from '@/lib/v1Dispatch';


// Shared single source of truth for tool name/title/description (also used by the
// stdio CLI, mcp-server-mcpindex/src/index.mjs) so the two can't drift.
import TOOL_META from '../../../mcp-server-mcpindex/src/tools-meta.json';
const tmeta = (name: string) => {
  const m = TOOL_META.find((x) => x.name === name);
  if (!m) throw new Error(`unknown tool ${name}`);
  return { title: m.title, description: m.description };
};

// The tools resolve /api/v1/* IN-PROCESS via lib/v1Dispatch (which imports and calls those
// route handlers directly) instead of fetching https://mcpindex.ai over the network. That kills
// the rate-limit self-starvation from the shared Vercel egress ip, makes preview deployments
// answer from their OWN data, and drops a DNS/TLS failure mode. Full rationale in v1Dispatch.ts.
// `api()` keeps its previous signature and throw-on-non-2xx contract, so the five tool call
// sites below are unchanged.

/* eslint-disable @typescript-eslint/no-explicit-any -- thin adapter over external JSON */

const api = (path: string): Promise<any> => callV1<any>(path);

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
  const exact = (server.installs ?? []).find((x: any) => x.client === client);
  const target = exact ?? server.installs?.[0];
  if (!target) return `No install path available for ${server.name}`;
  // Never mislabel a fallback as the requested client: if this server publishes no
  // config for `client`, show the header for the config we're ACTUALLY returning and
  // say so, so an agent doesn't paste (e.g.) a claude-desktop block into another client.
  const shownClient = exact ? client : (target.client ?? client);
  const fallbackNote = exact
    ? ''
    : `\n(No ${client}-specific config published for this server; showing the ${shownClient} config.)`;
  return [
    `${server.title} (${server.name}) - ${shownClient}`,
    '',
    target.json ? '```json\n' + target.json + '\n```' : '```bash\n' + target.command + '\n```',
    target.notes ? '\n' + target.notes : '',
    fallbackNote,
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

// Only clients that lib/installs.ts actually generates a config for. 'zed' was
// advertised here but never produced (buildInstalls has no zed branch), so a
// zed request silently fell back to another client's config; dropped until a real
// zed generator exists. formatInstall also labels any fallback honestly as defense.
const CLIENTS = ['claude-desktop', 'claude-code', 'cursor', 'gemini-cli', 'cline'] as const;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'recommend_mcp_for_task',
      {
        ...tmeta('recommend_mcp_for_task'),
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
        ...tmeta('search_mcp_servers'),
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
        ...tmeta('get_install_command'),
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
        ...tmeta('compare_servers'),
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
        ...tmeta('check_tool_trust'),
        inputSchema: {
          server_id: z
            .string()
            .describe(
              'Registry slug from search_mcp_servers / recommend results, e.g. "io-github-microsoft-playwright-mcp" (NOT a short name like "github").',
            ),
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
        ...tmeta('assess_server'),
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

// mcp-handler holds the (unauthenticated) connection open to maxDuration when the
// POST body is EMPTY or not valid JSON — a valid-JSON-but-not-JSON-RPC body already
// fast-fails with -32700, so only unparseable/empty input hangs. That is a cheap
// resource-exhaustion amplifier (each malformed POST ties up a serverless invocation
// for the full timeout). Pre-validate the body here and return the same fast -32700
// 400 for empty/unparseable input; valid JSON is forwarded to mcp-handler unchanged.
function parseError(): Response {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: Invalid JSON' } },
    { status: 400 },
  );
}

async function postHandler(req: Request, ctx: unknown): Promise<Response> {
  const raw = await req.text();
  if (raw.trim() === '') return parseError();
  try {
    JSON.parse(raw);
  } catch {
    return parseError();
  }
  // Body is a stream consumed once; rebuild an equivalent request for the handler.
  const forwarded = new Request(req.url, { method: req.method, headers: req.headers, body: raw });
  return (handler as (r: Request, c: unknown) => Promise<Response>)(forwarded, ctx);
}

export { handler as GET, postHandler as POST, handler as DELETE };
