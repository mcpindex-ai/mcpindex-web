// The MCP 2026-07-28 leg of /api/mcp, served in front of the SDK rather than by it.
//
// WHY THIS EXISTS. The 2026-07-28 revision removed the `initialize` handshake and moved
// version, identity and capabilities into per-request `_meta` plus mirrored HTTP headers.
// Neither SDK can speak it: `@modelcontextprotocol/sdk` caps at 2025-11-25
// (SUPPORTED_PROTOCOL_VERSIONS), and the Python SDK behind the MCPB server caps at the
// same. So mcpindex - which publishes measurements of 2026-07-28 ADOPTION - was itself a
// legacy-era server, and anyone assessing that work could probe this endpoint and find it.
// That is the gap this closes. It is a credibility fix, not a functional one: the crawled
// fleet is overwhelmingly legacy and no client in the wild speaks the new revision yet.
//
// SCOPE, AND WHY IT IS COMPLETE RATHER THAN PARTIAL. This server advertises
// `capabilities: { tools: {} }` and nothing else - no resources, no prompts, no
// subscriptions, no sampling. So `server/discover` + `tools/list` + `tools/call` is the
// WHOLE surface, not a convenient subset. Answering `server/discover` while failing
// `tools/call` would be worse than not answering at all: a modern client would resolve us
// as modern and then break on the first real call. Either the era works end to end here
// or it is not claimed.
//
// PROVENANCE OF THE WIRE SHAPE. Every literal below is taken from mcpindex-trust's own
// spec-derived client and census, not invented here:
//   - `_meta` keys + header names: src/trust/connector.py `_modern_params` /
//     `modern_headers_for_frame`
//   - error codes: connector.py ERR_HEADER_MISMATCH / ERR_UNSUPPORTED_PROTOCOL_VERSION
//   - DiscoverResult field set: scripts/mcp_era_census.py `_KNOWN_DISCOVER_KEYS` and the
//     valid-result fixture in corpus_eval/tooling/smoke_era_census.py
// Keeping them in one place here means a future revision is a single edit, and a
// divergence between what we SERVE and what we MEASURE is visible in one file.

export const MODERN_PROTOCOL_VERSIONS = ['2026-07-28'] as const;

// Spec-reserved JSON-RPC error codes. `-32601` is deliberately NOT treated as
// era-meaningful anywhere: it is a BASE JSON-RPC code that a legacy server returns for an
// unknown method exactly like a modern one, which is the measured trap recorded in
// tasks/todo-mcp-stdio-era-detection.md (three SDKs, three different codes for the same
// probe: -32602, -32601, and 0).
export const ERR_HEADER_MISMATCH = -32020;
export const ERR_UNSUPPORTED_PROTOCOL_VERSION = -32022;
export const ERR_METHOD_NOT_FOUND = -32601;
export const ERR_INVALID_PARAMS = -32602;
export const ERR_INTERNAL = -32603;

export const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion';
export const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

const SERVER_INFO = { name: 'mcpindex', version: '1.0.0' } as const;

/** A tool as both legs need it: one definition, two protocol front-ends. The legacy leg
 * registers `zodShape` with the SDK; the modern leg publishes `jsonSchema` and dispatches
 * `handler`. Deriving the JSON Schema from the SAME zod shape (zod 4's native
 * `z.toJSONSchema`) is deliberate - a hand-maintained second copy of a schema is the exact
 * divergence class that let the TS and Python drift classifiers disagree for weeks. */
export interface ModernTool {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly jsonSchema: unknown;
  readonly handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  readonly content: ReadonlyArray<{ type: 'text'; text: string }>;
  readonly isError?: boolean;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: unknown;
  error: { code: number; message: string; data?: unknown };
}
interface JsonRpcResult {
  jsonrpc: '2.0';
  id: unknown;
  result: unknown;
}
export type JsonRpcResponse = JsonRpcError | JsonRpcResult;

function err(id: unknown, code: number, message: string, data?: unknown): JsonRpcError {
  const e: JsonRpcError = { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  if (data !== undefined) e.error.data = data;
  return e;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** The protocol version a frame declares in its own `_meta`, or null for a legacy frame.
 * Mirrors connector.py `frame_protocol_version`. */
export function frameProtocolVersion(body: unknown): string | null {
  if (!isRecord(body)) return null;
  const params = body['params'];
  if (!isRecord(params)) return null;
  const meta = params['_meta'];
  if (!isRecord(meta)) return null;
  const v = meta[META_PROTOCOL_VERSION];
  return typeof v === 'string' && v !== '' ? v : null;
}

/** True when this request is asking for the modern era.
 *
 * NARROW ON PURPOSE, and this is the one decision in this file that could break every
 * existing client if it were wrong. `@modelcontextprotocol/sdk` 1.x sends
 * `MCP-Protocol-Version: 2025-11-25` on EVERY Streamable HTTP request after initialize, so
 * "the header is present" would capture all current legacy traffic into this leg and
 * answer it `-32022 unsupported protocol version`. Verified against the installed SDK's
 * SUPPORTED_PROTOCOL_VERSIONS, which tops out at 2025-11-25.
 *
 * So a request is modern only when it says so in a way a legacy client never does:
 *   - its body carries the `_meta` protocol-version KEY (any value) - legacy SDK requests
 *     may carry `_meta`, but never this key; or
 *   - its header names a version this server recognises as modern.
 * Accepting the body key with ANY value is deliberate: it keeps `-32022` reachable for a
 * FUTURE revision we do not implement, which is the whole point of carrying `supported`.
 * A legacy header version falls through to the SDK leg untouched, byte-identical to today. */
export function isModernRequest(body: unknown, headers: Headers): boolean {
  if (frameProtocolVersion(body) !== null) return true;
  const h = headers.get('MCP-Protocol-Version');
  return h !== null && (MODERN_PROTOCOL_VERSIONS as readonly string[]).includes(h);
}

/**
 * Serve one modern-era JSON-RPC request. Pure apart from the tool handlers it is given:
 * no transport, no global state, so the whole leg is testable without a socket.
 */
export async function handleModern(
  body: unknown,
  headers: Headers,
  tools: readonly ModernTool[],
): Promise<JsonRpcResponse> {
  const id = isRecord(body) ? body['id'] : null;

  if (!isRecord(body) || typeof body['method'] !== 'string') {
    return err(id, ERR_INVALID_PARAMS, 'malformed JSON-RPC request');
  }
  const method = body['method'];

  // HEADER/BODY AGREEMENT, checked before anything else. The header mirrors the body's
  // `_meta` by construction on a conforming client, so a disagreement means an
  // intermediary rewrote one of them - our own CSE proxy manufactured exactly this defect
  // by forwarding a modern body with the headers stripped, and the server correctly blamed
  // the client. Reporting it precisely is what let that be diagnosed.
  const headerVersion = headers.get('MCP-Protocol-Version');
  const bodyVersion = frameProtocolVersion(body);
  if (headerVersion !== null && bodyVersion !== null && headerVersion !== bodyVersion) {
    return err(
      id,
      ERR_HEADER_MISMATCH,
      `Header mismatch: MCP-Protocol-Version header (${headerVersion}) disagrees with the body's _meta (${bodyVersion})`,
    );
  }
  if (headerVersion === null && bodyVersion === null) {
    return err(id, ERR_HEADER_MISMATCH, 'Header mismatch: MCP-Protocol-Version missing');
  }
  const headerMethod = headers.get('Mcp-Method');
  if (headerMethod !== null && headerMethod !== method) {
    return err(
      id,
      ERR_HEADER_MISMATCH,
      `Header mismatch: Mcp-Method header (${headerMethod}) disagrees with the body method (${method})`,
    );
  }

  const version = bodyVersion ?? headerVersion;
  if (version === null || !MODERN_PROTOCOL_VERSIONS.includes(version as '2026-07-28')) {
    // Carry `supported` - the payload whose entire purpose is to let the caller retry
    // correctly. Discarding it is the defect that made a version mismatch undiagnosable
    // in the field on our own proxy.
    return err(id, ERR_UNSUPPORTED_PROTOCOL_VERSION, `unsupported protocol version: ${version}`, {
      supported: [...MODERN_PROTOCOL_VERSIONS],
    });
  }

  switch (method) {
    case 'server/discover':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          resultType: 'complete',
          supportedVersions: [...MODERN_PROTOCOL_VERSIONS],
          capabilities: { tools: { listChanged: false } },
          _meta: { [META_SERVER_INFO]: { ...SERVER_INFO } },
          instructions:
            'Search, compare and get install commands for MCP servers, and check a tool contract against mcpindex.',
          // PUBLIC IS HONEST HERE, and it is the one field worth justifying. A `public`
          // cacheScope on an AUTHENTICATED endpoint is a documented cross-authorization
          // leak: a shared cache can serve one caller's tool list to another. This
          // endpoint is unauthenticated and its tool set does not vary by caller - there
          // is no per-caller view to leak - so `public` describes reality. If this
          // endpoint ever gains auth or a caller-varying tool list, this MUST change.
          cacheScope: 'public',
          ttlMs: 3_600_000,
        },
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: tools.map((t) => ({
            name: t.name,
            title: t.title,
            description: t.description,
            inputSchema: t.jsonSchema,
          })),
        },
      };

    case 'tools/call': {
      const params = isRecord(body['params']) ? body['params'] : {};
      const name = params['name'];
      if (typeof name !== 'string') {
        return err(id, ERR_INVALID_PARAMS, 'tools/call requires a string `name`');
      }
      const tool = tools.find((t) => t.name === name);
      if (tool === undefined) {
        return err(id, ERR_METHOD_NOT_FOUND, `unknown tool: ${name}`);
      }
      const args = isRecord(params['arguments']) ? params['arguments'] : {};
      try {
        return { jsonrpc: '2.0', id, result: await tool.handler(args) };
      } catch (e) {
        // The handlers already convert their own expected failures into an isError
        // result; reaching here means an unexpected throw. Answer generically - this
        // endpoint is unauthenticated, so an internal message is a free structure probe -
        // and log the real one server-side. Same posture as the legacy leg's errText.
        console.error(`mcp modern tools/call ${name} failed:`, e);
        return err(id, ERR_INTERNAL, 'internal error');
      }
    }

    default:
      return err(id, ERR_METHOD_NOT_FOUND, `unknown method: ${method}`);
  }
}
