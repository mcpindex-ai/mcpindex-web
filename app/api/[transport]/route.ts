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
import { provenanceLine } from '@/lib/provenance';
import { z } from 'zod';

// In-process /api/v1 dispatch (no self-fetch); see lib/v1Dispatch.ts.
import { callV1, withTimeout } from '@/lib/v1Dispatch';
import { inspectMcpBody } from '@/lib/mcpBodyGuard';
import { armMcpWatchdog, contentLengthOf } from '@/lib/mcpWatchdog';
import { handleModern, isModernRequest, type ModernTool } from '@/lib/mcpModern';


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
// Messages we throw DELIBERATELY, and which are safe to hand an unauthenticated caller:
//   `mcpindex API <status>`  - lib/v1Dispatch on a non-2xx (status only; it is explicitly
//                              written not to leak the upstream body)
//   `invalid <label>`        - safeSeg above, fixed labels
// Anything else reaching this function is unexpected - a formatter TypeError such as
// "Cannot read properties of undefined (reading 'recommendations')" describes our internal
// shape to anyone who can POST. /api/mcp is unauthenticated, so that is a free structure
// probe. Those are logged server-side and answered generically instead.
//
// `mcpindex API: unroutable path ...` is deliberately NOT allowlisted: it only fires when our
// own tool code builds a path that does not exist, which is a bug on our side, not something
// the caller can act on.
const PUBLIC_TOOL_ERROR = /^(mcpindex API \d{3}|invalid [a-z_]+)$/;

const errText = (name: string, e: unknown) => {
  const raw = e instanceof Error ? e.message : String(e);
  const safe = PUBLIC_TOOL_ERROR.test(raw) ? raw : 'internal error';
  if (safe !== raw) console.error(`mcp tool ${name} failed:`, e);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Error calling ${name}: ${safe}` }],
  };
};

// --- formatters ported from the CLI (mcp-server-mcpindex/src/index.mjs) ---

function formatRecommend(data: any): string {
  const lines = [`Top ${data.recommendations.length} for: "${data.task}"`, ''];
  for (const r of data.recommendations) {
    lines.push(`[${r.rank}] ${r.title}  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`    ${r.name}`);
    lines.push(`    ${r.reasoning}`);
    // Same rule as formatSearch below, and it matters more here: this is the in-path
    // gate's own output. A qualityScore silently reduced by 10 with nothing saying why
    // is the same defect as an undocked one - the reader cannot see the correction.
    if (r.sourceLiveness) {
      const seen = r.sourceLiveness.confirmed_unavailable
        ? `, confirmed ${r.sourceLiveness.confirmed_unavailable}`
        : '';
      lines.push(
        `    ! Source repository not publicly accessible ` +
          `(HTTP ${r.sourceLiveness.evidence.http_status}${seen}); may be private or relocated.`,
      );
    }
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
  // Was `Source: ${data.note}` - which silently became an empty "Source:" line the moment
  // the route replaced `note` with a provenance block. Read the structured field, and fall
  // back to the local one-liner rather than printing a header with nothing under it: an
  // agent reading "Source:" followed by nothing learns less than one told plainly.
  lines.push(data.provenance?.basis ? `Basis: ${data.provenance.basis}` : provenanceLine());
  if (data.provenance?.anchor?.bitcoin_block) {
    lines.push(
      `Corpus anchored to Bitcoin block ${data.provenance.anchor.bitcoin_block} - verify: ${data.provenance.anchor.verify}`,
    );
  }
  return lines.join('\n');
}

function formatSearch(data: any): string {
  const lines = [`${data.total} results for: "${data.query}"`, ''];
  for (const r of data.results) {
    lines.push(`- ${r.title}  (${r.name})  ·  QS ${r.qualityScore}/100  ·  ${r.category}`);
    lines.push(`  ${r.description}`);
    // The caveat travels with the number or it does not travel at all. This is the line
    // an agent reads when deciding what to install, and it is a different medium from
    // the web page - nobody scrolls to a banner here. Observation plus hedge, never the
    // inference: a 404 cannot tell a deleted repository from a deliberately private one.
    if (r.sourceLiveness) {
      const seen = r.sourceLiveness.confirmed_unavailable
        ? `, confirmed ${r.sourceLiveness.confirmed_unavailable}`
        : '';
      lines.push(
        `  ! Source repository not publicly accessible ` +
          `(HTTP ${r.sourceLiveness.evidence.http_status}${seen}); may be private or relocated.`,
      );
    }
    lines.push(`  ${r.url ?? `https://mcpindex.ai/server/${r.slug}`}`);
  }
  // Quality Score rides on every row above and measures documentation and packaging
  // completeness, not safety. Unstated, an agent choosing what to execute reads it as the
  // latter - so the basis ships with the numbers rather than being a click away.
  lines.push('', provenanceLine());
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

// ONE definition per tool, TWO protocol front-ends.
//
// The legacy leg below registers `shape` with mcp-handler + the SDK, exactly as before.
// The 2026-07-28 leg (lib/mcpModern.ts) publishes a JSON Schema DERIVED from that same
// `shape` and dispatches `run` itself, because neither SDK can speak that revision - both
// cap at 2025-11-25. Deriving rather than hand-writing the second schema is deliberate: a
// maintained-by-hand duplicate is the divergence class that let the TS and Python drift
// classifiers disagree about the same server for weeks.
//
// `run` keeps each handler's exact previous body, so the legacy wire is unchanged.
type ToolDef = {
  name: string;
  // `Record<string, z.ZodType>`, not `z.ZodRawShape`: in zod 4 that alias resolves to a
  // Readonly<> map of the CORE `$ZodType`, while the SDK's overload wants the classic
  // `ZodType`. The runtime value is the same object either way - only the two declaration
  // files disagree - so the shape is described structurally here and narrowed at the one
  // call site below.
  shape: Record<string, z.ZodType>;
  run: (args: any) => Promise<any>;
};

const TOOL_DEFS: ToolDef[] = [
  {
    name: 'recommend_mcp_for_task',
    shape: {
      task: z.string().describe('Natural-language description of the task, e.g. "read PDFs and write to S3".'),
    },
    run: async ({ task }: { task: string }) => {
      try {
        return text(formatRecommend(await api(`/api/v1/recommend?task=${encodeURIComponent(task)}`)));
      } catch (e) {
        return errText('recommend_mcp_for_task', e);
      }
    },
  },
  {
    name: 'search_mcp_servers',
    shape: {
      query: z.string().describe('Search query.'),
      category: z.string().optional().describe('Optional category filter (e.g. database, browser, github).'),
      limit: z.number().int().min(1).max(50).optional().describe('Max results (default 10, max 50).'),
    },
    run: async ({ query, category, limit }: { query: string; category?: string; limit?: number }) => {
      try {
        const params = new URLSearchParams({ q: query, limit: String(Math.min(50, limit ?? 10)) });
        if (category) params.set('category', category);
        return text(formatSearch(await api(`/api/v1/search?${params.toString()}`)));
      } catch (e) {
        return errText('search_mcp_servers', e);
      }
    },
  },
  {
    name: 'get_install_command',
    shape: {
      server_slug: z.string().describe('Slug of the server (from search or recommend results).'),
      client: z.enum(CLIENTS).describe('Target client.'),
    },
    run: async ({ server_slug, client }: { server_slug: string; client: (typeof CLIENTS)[number] }) => {
      try {
        return text(
          formatInstall(await api(`/api/v1/server/${encodeURIComponent(safeSeg(server_slug, 'server_slug'))}`), client),
        );
      } catch (e) {
        return errText('get_install_command', e);
      }
    },
  },
  {
    name: 'compare_servers',
    shape: {
      slugs: z.array(z.string()).min(2).max(5).describe('Server slugs to compare.'),
    },
    run: async ({ slugs }: { slugs: string[] }) => {
      try {
        const rows = await Promise.all(
          slugs.map((s) => api(`/api/v1/server/${encodeURIComponent(safeSeg(s, 'slug'))}`)),
        );
        return text(formatCompare(rows));
      } catch (e) {
        return errText('compare_servers', e);
      }
    },
  },
  {
    name: 'check_tool_trust',
    shape: {
      server_id: z
        .string()
        .describe(
          'Registry slug from search_mcp_servers / recommend results, e.g. "io-github-microsoft-playwright-mcp" (NOT a short name like "github").',
        ),
      tool_name: z.string().describe('Tool name as exposed by the server (e.g. "create_pull_request").'),
    },
    run: async ({ server_id, tool_name }: { server_id: string; tool_name: string }) => {
      try {
        const v = await api(
          `/api/v1/trust/tool/${encodeURIComponent(safeSeg(server_id, 'server_id'))}/${encodeURIComponent(safeSeg(tool_name, 'tool_name'))}`,
        );
        return text(JSON.stringify(v, null, 2));
      } catch (e) {
        return errText('check_tool_trust', e);
      }
    },
  },
  {
    name: 'assess_server',
    shape: {
      server_id: z.string().describe('Server slug to assess.'),
    },
    run: async ({ server_id }: { server_id: string }) => {
      try {
        const v = await api(`/api/v1/trust/server/${encodeURIComponent(safeSeg(server_id, 'server_id'))}`);
        return text(JSON.stringify(v, null, 2));
      } catch (e) {
        return errText('assess_server', e);
      }
    },
  },
];

// The modern leg's view of the same six tools. `z.toJSONSchema` is zod 4 native - no new
// dependency, and no second copy of any schema to drift.
const MODERN_TOOLS: ModernTool[] = TOOL_DEFS.map((t) => ({
  name: t.name,
  ...tmeta(t.name),
  jsonSchema: z.toJSONSchema(z.object(t.shape)),
  handler: (args: Record<string, unknown>) => t.run(args),
}));

const handler = createMcpHandler(
  (server) => {
    for (const t of TOOL_DEFS) {
      server.registerTool(t.name, { ...tmeta(t.name), inputSchema: t.shape }, t.run);
    }
  },
  // mcp-handler 2.x takes ONE options object: the SDK's ServerOptions plus
  // `serverInfo`, `verboseLogs` and `onEvent`. The 1.x third argument is gone,
  // and with it two options that no longer exist:
  //
  //   basePath   - 2.x does no routing. "The returned handler serves every
  //                request it receives - routing belongs to the host framework."
  //                This file IS the route (app/api/[transport]/route.ts -> /api/mcp),
  //                so the mount point already says what basePath used to.
  //   disableSse - moot rather than dropped. It suppressed the standalone SSE GET
  //                endpoint, and 2026-07-28 REMOVED that endpoint from the protocol
  //                (see the Streamable HTTP binding: "Removal of the GET stream
  //                endpoint"). A per-request SSE *response* is still legal and is
  //                still bounded by `maxDuration` below.
  {
    serverInfo: { name: 'mcpindex', version: '1.0.0' },
    capabilities: { tools: {} },
  },
);

// PLATFORM timeout - the route-segment export Vercel actually reads. Without it Vercel used
// its plan default and invocations ran to `Task timed out after 300 seconds`.
//
// 60 is chosen against the real ceiling below it: callV1's dispatch timeout is 8s, so any
// honest request finishes far inside 60 and nothing legitimate is truncated. It caps a stuck
// invocation at 60s instead of 300s.
//
// This bounds blast radius; the exhaustion PRIMITIVE is bounded in lib/mcpBodyGuard.ts, which
// is the actual fix (unauthenticated JSON-RPC batches were fanning out ~36k tool calls per
// request). Keep both: the guard stops the known amplifier, this stops an unknown one.
export const maxDuration = 60;

// mcp-handler's OWN response plumbing has no timeout or catch of its own. Its Web-standard
// adapter (node_modules/mcp-handler/dist/index.js:723-834, createServerResponseAdapter)
// fire-and-forgets the internal handler - `void fn(fakeServerResponse)`, never awaited, never
// try/caught - and only builds a Response once that internal call gets around to calling
// `res.writeHead(...)`. If it throws, or anything else stops it from ever calling writeHead,
// the Response promise this whole route awaits simply never settles: nothing rejects it,
// nothing bounds it. Before this, nothing stood between that and the platform's own maxDuration
// above - 37 requests over 3 weeks rode that gap silently to `Vercel Runtime Timeout Error` with
// no error response ever sent to the caller and no diagnostic beyond "it hung to death."
//
// 55s, not 60s: armMcpWatchdog's own near-kill checkpoint fires at 50s (SLOW_MS/NEAR_KILL_MS
// in lib/mcpWatchdog.ts), so this settles just after that warning has already logged, and
// still leaves ~5s of margin under maxDuration for the forced response to actually reach the
// caller rather than racing the platform kill itself.
const HANDLER_TIMEOUT_MS = 55_000;

function handlerTimeoutResponse(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'mcpindex: request handling timed out' },
    },
    { status: 504 },
  );
}

/** Forces a hung mcp-handler promise into an honest error response instead of a silent hang. */
async function withHandlerTimeout(p: Promise<Response>, label: string): Promise<Response> {
  try {
    return await withTimeout(p, HANDLER_TIMEOUT_MS, label);
  } catch {
    return handlerTimeoutResponse();
  }
}

// mcp-handler holds the (unauthenticated) connection open to maxDuration when the
// POST body is EMPTY or not valid JSON — a valid-JSON-but-not-JSON-RPC body already
// fast-fails with -32700, so only unparseable/empty input hangs. That is a cheap
// resource-exhaustion amplifier (each malformed POST ties up a serverless invocation
// for the full timeout). Pre-validate the body here and return the same fast -32700
// 400 for empty/unparseable input; valid JSON is forwarded to mcp-handler unchanged.
async function postHandler(req: Request, ctx: unknown): Promise<Response> {
  // PHASE 1: the body read. A client can send headers with a Content-Length and then stall
  // the body, hanging here indefinitely - before the guard, before the descriptor, and
  // before the old watchdog, which armed only after this line. That blind spot is why a 60s
  // timeout on 2026-07-30 logged nothing. Content-Length is all we know until the body lands.
  const readDone = armMcpWatchdog({
    phase: 'body-read',
    httpMethod: req.method,
    contentLength: contentLengthOf(req),
  });
  let raw: string;
  try {
    raw = await req.text();
  } finally {
    readDone();
  }

  // Pre-dispatch inspection lives in lib/mcpBodyGuard.ts (pure, testable - importing THIS
  // module starts an mcp-handler setInterval that hangs node:test). It bounds an
  // unauthenticated resource-exhaustion primitive AND returns a PII-safe request shape; see
  // that file for the full chain.
  const seen = inspectMcpBody(raw);
  if ('reject' in seen) return seen.reject;

  // THE 2026-07-28 LEG, in front of the SDK because neither SDK can speak it (both cap at
  // 2025-11-25). Placed AFTER inspectMcpBody deliberately: the modern leg inherits the same
  // unauthenticated resource-exhaustion bound the legacy leg has, rather than opening a
  // second unguarded door to the same tools. `isModernRequest` is narrow by construction -
  // it cannot capture legacy SDK traffic, which sends a 2025-11-25 version header on every
  // request after initialize (see lib/mcpModern.ts for why that nearly broke every client).
  let parsed: unknown = undefined;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON: leave it to the SDK leg, which owns the legacy error shape for this case.
    parsed = undefined;
  }
  if (parsed !== undefined && isModernRequest(parsed, req.headers)) {
    const modernDone = armMcpWatchdog({
      phase: 'dispatch-modern',
      httpMethod: req.method,
      rpcMethod: seen.accept.method,
      tool: seen.accept.tool,
      bytes: seen.accept.bytes,
    });
    try {
      return Response.json(await handleModern(parsed, req.headers, MODERN_TOOLS));
    } finally {
      modernDone();
    }
  }

  // Body is a stream consumed once; rebuild an equivalent request for the handler.
  const forwarded = new Request(req.url, { method: req.method, headers: req.headers, body: raw });

  // PHASE 2: dispatch. AWAIT, not a bare return: `finally` must run after the handler
  // settles, or the watchdog would disarm immediately and observe nothing.
  const disarm = armMcpWatchdog({
    phase: 'dispatch',
    httpMethod: req.method,
    rpcMethod: seen.accept.method,
    tool: seen.accept.tool,
    bytes: seen.accept.bytes,
  });
  try {
    return await withHandlerTimeout(
      (handler as (r: Request, c: unknown) => Promise<Response>)(forwarded, ctx),
      'mcp-handler:POST',
    );
  } finally {
    disarm();
  }
}

// mcp-handler's basePath claims EVERY /api/<transport> segment, not just /api/mcp -
// including /api/sse, the legacy HTTP+SSE transport. We only serve Streamable HTTP,
// and the SSE transport needs a Redis message channel we do not run, so /api/sse
// accepted the connection and then hung to the client's timeout: no status, no body,
// no diagnostic (measured 40s+, 0 bytes, 2026-07-24). Clients pinned to the legacy
// transport - Spring AI 1.0.x has no streamable-http support at all, verified against
// the published jars - had no way to discover they were on the wrong URL. Fail fast
// with the canonical one instead; a 404 the client can read beats a silent hang.
const CANONICAL_TRANSPORT = 'mcp';

async function wrongTransport(ctx: unknown): Promise<Response | null> {
  const { transport } = await (ctx as { params: Promise<{ transport: string }> }).params;
  if (transport === CANONICAL_TRANSPORT) return null;
  // Echo the segment back so the operator can see what they asked for, but don't
  // reflect unbounded caller-controlled input: same posture as safeSeg() above.
  const echoed = transport.replace(/[^\w.-]/g, '').slice(0, 32) || 'unknown';
  return Response.json(
    {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message:
          `Unsupported transport "${echoed}". mcpindex serves Streamable HTTP only - ` +
          `connect to https://mcpindex.ai/api/${CANONICAL_TRANSPORT}.`,
      },
    },
    { status: 404 },
  );
}

type RouteHandler = (req: Request, ctx: unknown) => Promise<Response>;
const onlyCanonical =
  (h: RouteHandler): RouteHandler =>
  async (req, ctx) =>
    (await wrongTransport(ctx)) ?? h(req, ctx);

const mcpHandler = handler as RouteHandler;

// GET and DELETE go straight to mcp-handler and never enter postHandler, so they had no
// watchdog at all - a hang on either was invisible. They carry no body, so one phase covers
// them.
const watched =
  (h: RouteHandler, httpMethod: string): RouteHandler =>
  async (req, ctx) => {
    const disarm = armMcpWatchdog({ phase: 'dispatch', httpMethod });
    try {
      return await withHandlerTimeout(h(req, ctx), `mcp-handler:${httpMethod}`);
    } finally {
      disarm();
    }
  };

export const GET = onlyCanonical(watched(mcpHandler, 'GET'));
export const POST = onlyCanonical(postHandler);
export const DELETE = onlyCanonical(watched(mcpHandler, 'DELETE'));
