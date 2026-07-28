// Body caps on the UNAUTHENTICATED MCP endpoint (/api/mcp).
//
// These guard a resource-exhaustion primitive, not a style rule. The route sets no
// sessionIdGenerator, so the MCP SDK runs stateless and requires no `initialize` handshake
// before a call; it then dispatches every element of a JSON-RPC array, holding one SSE
// response open until all resolve. proxy.ts meters by HTTP REQUEST (60/min per IP), not per
// JSON-RPC message, and lib/v1Dispatch resolves tools in-process so the fan-out never
// re-enters the limiter. One body-ceiling POST therefore bought ~36,000 tool calls for one
// of the caller's 60 tokens until these guards landed.
//
// Imports lib/mcpBodyGuard directly, NOT the route: importing the route module runs
// createMcpHandler() at module scope, which starts an mcp-handler setInterval
// (mcp-handler/dist/index.js:238) that keeps this runner alive forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkMcpBody, MAX_BODY_BYTES } from '../../lib/mcpBodyGuard';

async function codeOf(r: Response): Promise<number> {
  const body = (await r.json()) as { error: { code: number } };
  return body.error.code;
}

test('batch: a 2-message JSON-RPC array is rejected (-32600, 400)', async () => {
  const r = checkMcpBody(
    JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]),
  );
  assert.ok(r, 'batch must be rejected');
  assert.equal(r.status, 400);
  assert.equal(await codeOf(r), -32600);
});

test('batch: even a SINGLE-element array is rejected (arrays are the primitive, not length)', async () => {
  const r = checkMcpBody(JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]));
  assert.ok(r);
  assert.equal(r.status, 400);
  assert.equal(await codeOf(r), -32600);
});

test('batch: a 36k-message array - the actual exploit shape - is rejected', async () => {
  const huge = JSON.stringify(
    Array.from({ length: 36_000 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/list' })),
  );
  const r = checkMcpBody(huge);
  assert.ok(r, 'the exploit payload must never reach mcp-handler');
  assert.equal(r.status, 400);
});

test('oversized body (>256KB) is rejected before JSON.parse', async () => {
  // Deliberately VALID JSON: proves the SIZE gate fires, not the parse gate.
  const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'x', params: { p: 'a'.repeat(300 * 1024) } });
  assert.ok(big.length > MAX_BODY_BYTES);
  const r = checkMcpBody(big);
  assert.ok(r);
  assert.equal(await codeOf(r), -32600);
});

test('empty body -> parse error (-32700), unchanged', async () => {
  const r = checkMcpBody('');
  assert.ok(r);
  assert.equal(await codeOf(r), -32700);
});

test('whitespace-only body -> parse error (-32700), unchanged', async () => {
  const r = checkMcpBody('   \n  ');
  assert.ok(r);
  assert.equal(await codeOf(r), -32700);
});

test('unparseable body -> parse error (-32700), unchanged', async () => {
  const r = checkMcpBody('{not json');
  assert.ok(r);
  assert.equal(await codeOf(r), -32700);
});

test('a single well-formed object PASSES the guards (no over-blocking)', () => {
  assert.equal(checkMcpBody(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })), null);
});

test('a realistic tool call with prose args PASSES', () => {
  const call = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'recommend_mcp_for_task', arguments: { task: 'read PDFs and write to S3' } },
  });
  assert.equal(checkMcpBody(call), null);
});
