// Unit tests for the MCP 2026-07-28 leg of /api/mcp (lib/mcpModern.ts).
//
// The load-bearing test in this file is the FIRST one: `isModernRequest` must not capture
// legacy SDK traffic. @modelcontextprotocol/sdk 1.x sends `MCP-Protocol-Version:
// 2025-11-25` on every Streamable HTTP request after initialize, so a naive "the header is
// present" check would route every existing client into this leg and answer -32022. That
// would have broken every connected client on deploy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERR_HEADER_MISMATCH,
  ERR_METHOD_NOT_FOUND,
  ERR_UNSUPPORTED_PROTOCOL_VERSION,
  META_PROTOCOL_VERSION,
  META_SERVER_INFO,
  handleModern,
  isModernRequest,
  type ModernTool,
} from './mcpModern';

const MODERN = '2026-07-28';

const TOOLS: ModernTool[] = [
  {
    name: 'echo',
    title: 'Echo',
    description: 'echoes',
    jsonSchema: { type: 'object', properties: { q: { type: 'string' } } },
    handler: async (args) => ({ content: [{ type: 'text', text: `got:${String(args['q'])}` }] }),
  },
  {
    name: 'boom',
    title: 'Boom',
    description: 'throws',
    jsonSchema: { type: 'object' },
    handler: async () => {
      throw new Error('internal detail that must not reach the caller');
    },
  },
];

function modernBody(method: string, params: Record<string, unknown> = {}, version = MODERN) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method,
    params: { ...params, _meta: { [META_PROTOCOL_VERSION]: version } },
  };
}

function headers(h: Record<string, string> = {}): Headers {
  return new Headers(h);
}

function errOf(r: unknown): { code: number; message: string; data?: unknown } {
  const e = (r as { error?: { code: number; message: string; data?: unknown } }).error;
  assert.ok(e, `expected a JSON-RPC error, got ${JSON.stringify(r)}`);
  return e;
}

test('REGRESSION GUARD: a legacy SDK request is NOT captured by the modern leg', () => {
  // Exactly what @modelcontextprotocol/sdk 1.x sends post-initialize.
  const legacyBody = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };
  const legacyHeaders = headers({ 'MCP-Protocol-Version': '2025-11-25' });
  assert.equal(isModernRequest(legacyBody, legacyHeaders), false);

  // Legacy bodies may legitimately carry _meta (progress tokens) - still not modern.
  const withMeta = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { _meta: { progressToken: 7 } } };
  assert.equal(isModernRequest(withMeta, legacyHeaders), false);
  assert.equal(isModernRequest(withMeta, headers()), false);
});

test('a modern request is recognised from the body _meta, or from a modern header', () => {
  assert.equal(isModernRequest(modernBody('server/discover'), headers()), true);
  const bare = { jsonrpc: '2.0', id: 1, method: 'server/discover', params: {} };
  assert.equal(isModernRequest(bare, headers({ 'MCP-Protocol-Version': MODERN })), true);
});

test('an UNKNOWN future version still reaches this leg and gets -32022 with `supported`', async () => {
  // The body key is accepted with any value precisely so a future revision can be told
  // what we do speak, rather than falling through to an SDK error that says nothing.
  const body = modernBody('server/discover', {}, '2027-01-01');
  assert.equal(isModernRequest(body, headers()), true);
  const e = errOf(await handleModern(body, headers(), TOOLS));
  assert.equal(e.code, ERR_UNSUPPORTED_PROTOCOL_VERSION);
  assert.deepEqual(e.data, { supported: [MODERN] });
});

test('server/discover returns a DiscoverResult with the fields the census reads', async () => {
  const r = (await handleModern(modernBody('server/discover'), headers(), TOOLS)) as {
    result: Record<string, unknown>;
  };
  assert.equal(r.result['resultType'], 'complete');
  assert.deepEqual(r.result['supportedVersions'], [MODERN]);
  assert.deepEqual(r.result['capabilities'], { tools: { listChanged: false } });
  const meta = r.result['_meta'] as Record<string, unknown>;
  assert.deepEqual(meta[META_SERVER_INFO], { name: 'mcpindex', version: '1.0.0' });
  // `public` is honest ONLY because this endpoint is unauthenticated and its tool set does
  // not vary by caller. If either changes, this assertion should fail and force the review.
  assert.equal(r.result['cacheScope'], 'public');
});

test('header/body disagreement is -32020, not a silently-preferred winner', async () => {
  const e = errOf(
    await handleModern(modernBody('server/discover'), headers({ 'MCP-Protocol-Version': '2025-11-25' }), TOOLS),
  );
  assert.equal(e.code, ERR_HEADER_MISMATCH);
  assert.match(e.message, /disagrees/);
});

test('Mcp-Method disagreeing with the body method is -32020', async () => {
  const e = errOf(
    await handleModern(
      modernBody('tools/list'),
      headers({ 'MCP-Protocol-Version': MODERN, 'Mcp-Method': 'tools/call' }),
      TOOLS,
    ),
  );
  assert.equal(e.code, ERR_HEADER_MISMATCH);
});

test('tools/list publishes every tool with its JSON Schema', async () => {
  const r = (await handleModern(modernBody('tools/list'), headers(), TOOLS)) as {
    result: { tools: Array<Record<string, unknown>> };
  };
  assert.equal(r.result.tools.length, 2);
  assert.equal(r.result.tools[0]['name'], 'echo');
  assert.deepEqual(r.result.tools[0]['inputSchema'], TOOLS[0].jsonSchema);
});

test('tools/call dispatches, and an unknown tool is -32601', async () => {
  const ok = (await handleModern(
    modernBody('tools/call', { name: 'echo', arguments: { q: 'hi' } }),
    headers(),
    TOOLS,
  )) as { result: { content: Array<{ text: string }> } };
  assert.equal(ok.result.content[0].text, 'got:hi');

  const e = errOf(await handleModern(modernBody('tools/call', { name: 'nope' }), headers(), TOOLS));
  assert.equal(e.code, ERR_METHOD_NOT_FOUND);
});

test('a throwing handler answers generically - this endpoint is unauthenticated', async () => {
  const e = errOf(await handleModern(modernBody('tools/call', { name: 'boom' }), headers(), TOOLS));
  assert.equal(e.message, 'internal error');
  assert.doesNotMatch(JSON.stringify(e), /internal detail/, 'must not leak the thrown message');
});

test('an unknown method is -32601, and the code is never used to infer an era', async () => {
  const e = errOf(await handleModern(modernBody('resources/list'), headers(), TOOLS));
  assert.equal(e.code, ERR_METHOD_NOT_FOUND);
});
