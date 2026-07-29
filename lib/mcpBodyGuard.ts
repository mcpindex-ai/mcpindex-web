/**
 * Pre-dispatch inspection for the UNAUTHENTICATED MCP endpoint (/api/mcp).
 *
 * Does two jobs from ONE parse: reject what we refuse to dispatch, and describe what we DO
 * dispatch, so a slow request can be identified later without re-reading a consumed body.
 *
 * Lives in lib/ rather than in the route because importing the route module runs
 * createMcpHandler() at module scope, which starts an mcp-handler cleanup setInterval
 * (mcp-handler/dist/index.js:238) that keeps node:test alive forever. Keeping the rules
 * pure and dependency-free is what makes them testable at all - and it is the repo's
 * "separate orchestration from execution" rule applied to the one surface where the
 * validation, not the transport, is the security control.
 */

/** JSON-RPC parse error. Wrong-shaped bytes, before we know anything else. */
export function parseError(): Response {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: Invalid JSON' } },
    { status: 400 },
  );
}

/** JSON-RPC invalid-request. Parseable, but something we refuse to dispatch. */
export function invalidRequest(message: string): Response {
  return Response.json(
    { jsonrpc: '2.0', id: null, error: { code: -32600, message } },
    { status: 400 },
  );
}

// A JSON-RPC message this endpoint will actually serve is small: the largest real tool call
// is a sentence of prose plus a slug. 256KB is ~1000x headroom and still far under Vercel's
// ~4.5MB body ceiling, which is what an attacker would otherwise get to spend.
export const MAX_BODY_BYTES = 256 * 1024;

/**
 * PII-SAFE request shape, for logs.
 *
 * Carries NO caller content by construction: `method` and `tool` come from closed vocabularies
 * (JSON-RPC method names, our own six registered tools) and `bytes` is a length.
 * `params.arguments` is the user's prose - a task description, a slug they typed - and never
 * appears here. That is the entire reason this type exists rather than logging the body.
 */
export type McpRequestShape = {
  method: string;
  /** Present only for tools/call. One of our own tool names. */
  tool?: string;
  bytes: number;
};

export type McpInspection = { reject: Response } | { accept: McpRequestShape };

function shapeOf(parsed: unknown, bytes: number): McpRequestShape {
  const o = (parsed ?? {}) as Record<string, unknown>;
  const method = typeof o.method === 'string' ? o.method : '<none>';
  const params = (o.params ?? {}) as Record<string, unknown>;
  const tool = method === 'tools/call' && typeof params.name === 'string' ? params.name : undefined;
  return tool ? { method, tool, bytes } : { method, bytes };
}

export function inspectMcpBody(raw: string): McpInspection {
  if (raw.trim() === '') return { reject: parseError() };

  // Size gate BEFORE JSON.parse: parsing a multi-megabyte adversarial body is itself the work
  // we are declining to do for an anonymous caller.
  if (raw.length > MAX_BODY_BYTES) {
    return { reject: invalidRequest(`Request body exceeds ${MAX_BODY_BYTES} bytes`) };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { reject: parseError() };
  }

  // REJECT JSON-RPC BATCHES. This is a resource-exhaustion primitive, not a style rule.
  //
  // The route sets no sessionIdGenerator, so the MCP SDK runs STATELESS and its
  // validateSession short-circuits - no `initialize` handshake is required before a call.
  // The SDK then maps an arbitrary-length array and dispatches every element, holding one
  // SSE response open until all resolve. Meanwhile proxy.ts meters by HTTP REQUEST
  // (`mcp:<ip>`, 60/min), not by JSON-RPC message, and lib/v1Dispatch resolves each tool
  // in-process so the fan-out never re-enters that limiter.
  //
  // Net effect before this guard: one POST at the body ceiling carried ~36,000 tool calls
  // for ONE of the caller's 60 tokens - about 10^4 amplification, unauthenticated. Verified
  // against production 2026-07-28: a 2-message batch with no handshake returned 200 with
  // both results.
  //
  // Rejecting outright rather than capping length: this deployment is stateless, has no
  // batching client, and MCP revision 2025-06-18 removed batch support from the spec.
  if (Array.isArray(parsed)) {
    return {
      reject: invalidRequest(
        'JSON-RPC batching is not supported. Send one message per request to /api/mcp.',
      ),
    };
  }

  return { accept: shapeOf(parsed, raw.length) };
}
