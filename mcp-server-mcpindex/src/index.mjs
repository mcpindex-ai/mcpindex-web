#!/usr/bin/env node
// mcp-server-mcpindex - an MCP server for finding MCP servers.
// Backend: api.mcpindex.ai (versioned, free tier - no key needed for v0).
//
// Serves BOTH protocol eras from one tool registry: the 2026-07-28 revision
// (server/discover + per-request _meta envelope, no initialize) and the
// 2025-11-25-and-earlier initialize handshake. serveStdio owns the era
// decision per connection; `legacy: 'serve'` keeps every existing client
// (Claude Desktop, Cursor, Cline, Gemini CLI) on the handshake they already
// speak. Migrated from @modelcontextprotocol/sdk 1.x, which caps at
// 2025-11-25 and cannot answer a modern-only client.

import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export { checkToolTrust, assessServer, VERDICT_CONTRACT_VERSION, V1_HONEST_LIMITS } from './trust.mjs';
import { isSafeSegment } from './trust.mjs';
import { notifyUpdateIfAvailable } from './update-check.mjs';

// `||` (not `??`) so an empty MCPINDEX_API_BASE - which some MCPB hosts substitute
// for an unset optional user_config field - falls back to the default instead of
// becoming "" and breaking every fetch with a relative URL.
const API_BASE = process.env.MCPINDEX_API_BASE || 'https://mcpindex.ai';
// Single source of truth for the running version - read from package.json so the
// User-Agent and the update-check can never drift from what npm actually shipped.
const PKG_VERSION = createRequire(import.meta.url)('../package.json').version;
// Single source of truth for tool name/title/description, shared with the hosted
// remote endpoint (mcpindex-web/app/api/[transport]/route.ts) so copy can't drift.
const TOOL_META = createRequire(import.meta.url)('./tools-meta.json');
const TOOL_DESC = Object.fromEntries(TOOL_META.map((m) => [m.name, m.description]));
const TOOL_TITLE = Object.fromEntries(TOOL_META.map((m) => [m.name, m.title]));

const TOOLS = [
  {
    name: 'recommend_mcp_for_task',
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
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
        category: {
          type: 'string',
          description:
            'Optional category filter (e.g. database, browser, github, productivity).',
        },
        // Same bounds as the hosted endpoint (z.number().int().min(1).max(50)). This was
        // an unbounded number, so 0, -3 and 2.5 were accepted and silently clamped.
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Max results (default 10, max 50).',
          default: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_install_command',
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
          // Only clients the API actually generates a config for. 'zed' was advertised
          // but never produced (buildInstalls has no zed branch), so a zed request silently
          // fell back to another client's config; dropped until a real zed generator exists.
          // formatInstall also labels any fallback honestly as defense-in-depth.
          enum: ['claude-desktop', 'claude-code', 'cursor', 'gemini-cli', 'cline'],
          description: 'Target client.',
        },
      },
      required: ['server_slug', 'client'],
    },
  },
  {
    name: 'compare_servers',
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
    inputSchema: {
      type: 'object',
      properties: {
        server_id: {
          type: 'string',
          description:
            'Registry slug from search_mcp_servers / recommend results, e.g. "io-github-microsoft-playwright-mcp" (NOT a short name like "github").',
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

// Upstream bodies never reach tool output verbatim. A miss on a path the API does not
// route returns the site's full HTML 404 page (about 46 KB), which this used to append to
// the error. On a non-2xx we keep only the API's own short JSON `error` string, if it sent
// one; anything else is reduced to the status.
const MAX_ERROR_REASON = 200;

async function api(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'User-Agent': `mcp-server-mcpindex/${PKG_VERSION}`, Accept: 'application/json' },
  });
  const body = await res.text();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    data = undefined;
  }
  if (!res.ok) {
    const reason =
      data && typeof data.error === 'string' && data.error.length <= MAX_ERROR_REASON
        ? `: ${data.error}`
        : '';
    throw new Error(`mcpindex API ${res.status}${reason}`);
  }
  if (data === undefined) {
    throw new Error(`mcpindex API ${res.status}: response was not JSON`);
  }
  return data;
}

// Same input guard as the hosted endpoint's safeSeg: an empty slug used to fetch
// /api/v1/server/ and '..' walked the API path.
function seg(v, label) {
  if (!isSafeSegment(v)) throw new Error(`invalid ${label}`);
  return encodeURIComponent(v);
}

async function runTool(name, args) {
  switch (name) {
    case 'recommend_mcp_for_task': {
      const data = await api(
        `/api/v1/recommend?task=${encodeURIComponent(args.task)}`,
      );
      return formatRecommend(data);
    }
    case 'search_mcp_servers': {
      const params = new URLSearchParams({
        q: args.query,
        limit: String(Math.min(50, args.limit ?? 10)),
      });
      if (args.category) params.set('category', args.category);
      const data = await api(`/api/v1/search?${params.toString()}`);
      return formatSearch(data);
    }
    case 'get_install_command': {
      const data = await api(`/api/v1/server/${seg(args.server_slug, 'server_slug')}`);
      return formatInstall(data, args.client);
    }
    case 'compare_servers': {
      const rows = await Promise.all(
        args.slugs.map((s) => api(`/api/v1/server/${seg(s, 'slug')}`)),
      );
      return formatCompare(rows);
    }
    case 'check_tool_trust': {
      const { checkToolTrust } = await import('./trust.mjs');
      const verdict = await checkToolTrust({
        serverId: args.server_id,
        toolName: args.tool_name,
        apiBase: API_BASE,
        userAgent: `mcp-server-mcpindex/${PKG_VERSION}`,
      });
      return JSON.stringify(verdict, null, 2);
    }
    case 'assess_server': {
      const { assessServer } = await import('./trust.mjs');
      const verdict = await assessServer({
        serverId: args.server_id,
        apiBase: API_BASE,
        userAgent: `mcp-server-mcpindex/${PKG_VERSION}`,
      });
      return JSON.stringify(verdict, null, 2);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// One factory serves both eras. serveStdio may invoke it more than once on a
// connection (probe instance discarded on era fallback), so it must stay
// side-effect free.
export function buildServer() {
  const server = new McpServer(
    { name: 'mcp-server-mcpindex', version: PKG_VERSION },
    // Tools only. We do NOT advertise `logging`: the update notice goes to stderr (which
    // every host surfaces), not via `notifications/message` (rendered inconsistently - Cursor
    // logs it as a bare ` undefined`). stderr is the universal, clean channel.
    // listChanged EXPLICITLY false: registerTool defaults it to true, and this
    // server never emits notifications/tools/list_changed. Advertising it would
    // be exactly the declared-vs-observed gap mcpindex measures in other
    // people's servers.
    { capabilities: { tools: { listChanged: false } } },
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: TOOL_TITLE[tool.name],
        description: TOOL_DESC[tool.name],
        inputSchema: fromJsonSchema(tool.inputSchema),
      },
      async (args) => {
        try {
          const result = await runTool(tool.name, args);
          return { content: [{ type: 'text', text: result }] };
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error calling ${tool.name}: ${err instanceof Error ? err.message : err}`,
              },
            ],
          };
        }
      },
    );
  }
  return server;
}

// Ported from the hosted endpoint's formatters (mcpindex-web app/api/[transport]/route.ts)
// so both transports print the same caveats. The stdio copies predated two of them: the
// source-liveness line and the provenance line.

// The hosted endpoint builds this line in-process from lib/provenance.ts and appends the
// Bitcoin anchor when one is confirmed. The anchor state is not in the search response, so
// stdio prints the unanchored form rather than asserting an anchor it cannot see.
const PROVENANCE_LINE =
  'Source: mcpindex.ai - advisory, semantic-only screen; not a safety verdict.';

function livenessLine(r, indent) {
  // Observation plus hedge, never the inference: a 404 cannot tell a deleted repository
  // from a deliberately private one.
  if (!r.sourceLiveness) return null;
  const seen = r.sourceLiveness.confirmed_unavailable
    ? `, confirmed ${r.sourceLiveness.confirmed_unavailable}`
    : '';
  return (
    `${indent}! Source repository not publicly accessible ` +
    `(HTTP ${r.sourceLiveness.evidence?.http_status ?? 'unknown'}${seen}); may be private or relocated.`
  );
}

export function formatRecommend(data) {
  const lines = [`Top ${data.recommendations.length} for: "${data.task}"`, ''];
  for (const r of data.recommendations) {
    lines.push(`[${r.rank}] ${r.title}  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`    ${r.name}`);
    lines.push(`    ${r.reasoning}`);
    const live = livenessLine(r, '    ');
    if (live) lines.push(live);
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
  lines.push(data.provenance?.basis ? `Basis: ${data.provenance.basis}` : PROVENANCE_LINE);
  if (data.provenance?.anchor?.bitcoin_block) {
    lines.push(
      `Corpus anchored to Bitcoin block ${data.provenance.anchor.bitcoin_block} - verify: ${data.provenance.anchor.verify}`,
    );
  }
  return lines.join('\n');
}

export function formatSearch(data) {
  const lines = [`${data.total} results for: "${data.query}"`, ''];
  for (const r of data.results) {
    lines.push(`- ${r.title}  (${r.name})  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`  ${r.description}`);
    const live = livenessLine(r, '  ');
    if (live) lines.push(live);
    lines.push(`  ${r.url ?? `https://mcpindex.ai/server/${r.slug}`}`);
  }
  lines.push('', PROVENANCE_LINE);
  return lines.join('\n');
}

export function formatInstall(server, client) {
  // server here is the per-server JSON we expose at /api/v1/server/<slug>.
  // Returns a code block with the appropriate install snippet.
  const exact = (server.installs ?? []).find((i) => i.client === client);
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
    installBlock(target),
    target.notes ? '\n' + target.notes : '',
    fallbackNote,
    `\n${server.url ?? `https://mcpindex.ai/server/${server.slug}`}`,
  ].join('\n');
}

// A remote target's `command` is a URL to paste into a client's config, not a shell
// command, so it is not fenced as bash.
function installBlock(target) {
  if (target.json) return '```json\n' + target.json + '\n```';
  if (target.client === 'remote') return 'Remote endpoint URL (add it to your client as a remote MCP server):\n```\n' + target.command + '\n```';
  return '```bash\n' + target.command + '\n```';
}

// The install column used to print installs[0].label, which is the first client's label
// (e.g. "Claude Desktop (claude_desktop_config.json)") whatever the server ships. List the
// distinct install methods instead.
export function installMethods(installs) {
  const kinds = [];
  for (const t of installs ?? []) {
    const text = `${t.json ?? ''} ${t.command ?? ''}`;
    const kind =
      t.client === 'remote'
        ? 'remote'
        : /\buvx\b/.test(text)
          ? 'pypi'
          : /\bdocker\b/.test(text)
            ? 'docker'
            : /\bnpx\b/.test(text)
              ? 'npm'
              : null;
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds.length ? kinds.join('+') : 'manual';
}

export function formatCompare(rows) {
  const header = ['name', 'category', 'quality', 'install', 'env vars'];
  const data = rows.map((r) => [
    String(r.name ?? ''),
    String(r.category ?? ''),
    String(r.qualityScore ?? ''),
    installMethods(r.installs),
    String(r.envVars?.length ?? 0),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...data.map((row) => row[i].length)),
  );
  const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  return [fmt(header), fmt(widths.map((w) => '-'.repeat(w))), ...data.map(fmt)].join('\n');
}

// Connect only when executed as the CLI (bin/npx/node src/index.mjs), not when
// imported - imports get buildServer() and the trust re-exports with no side
// effects, which is what makes the protocol tests possible. realpathSync resolves
// the bin symlink npm installs.
const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (isMain) {
  serveStdio(buildServer, {
    legacy: 'serve',
    onerror: (err) => console.error(`[mcp-server-mcpindex] ${err.message}`),
  });
  console.error('[mcp-server-mcpindex] serving on stdio');

  // Fire-and-forget: tell the user if a newer version exists (stderr only - the channel
  // every host renders cleanly). Dropped onto the event loop AFTER connect so it can never
  // delay or crash startup; all errors are swallowed inside.
  notifyUpdateIfAvailable({ currentVersion: PKG_VERSION }).catch(() => {});
}
