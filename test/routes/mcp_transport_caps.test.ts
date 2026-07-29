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

import { inspectMcpBody, MAX_BODY_BYTES } from '../../lib/mcpBodyGuard';

async function codeOf(r: Response): Promise<number> {
  const body = (await r.json()) as { error: { code: number } };
  return body.error.code;
}

/** Assert the body was refused, and hand back the Response. */
function rejected(raw: string): Response {
  const out = inspectMcpBody(raw);
  assert.ok('reject' in out, 'expected this body to be refused');
  return out.reject;
}

test('batch: a 2-message JSON-RPC array is rejected (-32600, 400)', async () => {
  const r = rejected(
    JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]),
  );
  assert.equal(r.status, 400);
  assert.equal(await codeOf(r), -32600);
});

test('batch: even a SINGLE-element array is rejected (arrays are the primitive, not length)', async () => {
  const r = rejected(JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]));
  assert.equal(r.status, 400);
  assert.equal(await codeOf(r), -32600);
});

test('batch: a 36k-message array - the actual exploit shape - is rejected', async () => {
  const huge = JSON.stringify(
    Array.from({ length: 36_000 }, (_, i) => ({ jsonrpc: '2.0', id: i, method: 'tools/list' })),
  );
  const r = rejected(huge);
  assert.equal(r.status, 400);
});

test('oversized body (>256KB) is rejected before JSON.parse', async () => {
  // Deliberately VALID JSON: proves the SIZE gate fires, not the parse gate.
  const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'x', params: { p: 'a'.repeat(300 * 1024) } });
  assert.ok(big.length > MAX_BODY_BYTES);
  const r = rejected(big);
  assert.equal(await codeOf(r), -32600);
});

test('empty body -> parse error (-32700), unchanged', async () => {
  const r = rejected('');
  assert.equal(await codeOf(r), -32700);
});

test('whitespace-only body -> parse error (-32700), unchanged', async () => {
  const r = rejected('   \n  ');
  assert.equal(await codeOf(r), -32700);
});

test('unparseable body -> parse error (-32700), unchanged', async () => {
  const r = rejected('{not json');
  assert.equal(await codeOf(r), -32700);
});

test('a single well-formed object PASSES the guards (no over-blocking)', () => {
  const out = inspectMcpBody(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
  assert.ok('accept' in out, 'a normal message must not be refused');
  assert.equal(out.accept.method, 'tools/list');
});

test('a realistic tool call with prose args PASSES', () => {
  const call = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'recommend_mcp_for_task', arguments: { task: 'read PDFs and write to S3' } },
  });
  const out = inspectMcpBody(call);
  assert.ok('accept' in out);
  assert.equal(out.accept.method, 'tools/call');
  assert.equal(out.accept.tool, 'recommend_mcp_for_task');
});

// --- request shape for logs: the property that matters is what it does NOT carry ---

test('the descriptor never carries caller content (params.arguments is the user prose)', () => {
  const secret = 'my-private-task-about-acme-acquisition';
  const out = inspectMcpBody(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'recommend_mcp_for_task', arguments: { task: secret } },
    }),
  );
  assert.ok('accept' in out);
  const serialized = JSON.stringify(out.accept);
  assert.ok(!serialized.includes(secret), `descriptor leaked caller content: ${serialized}`);
  assert.ok(!serialized.includes('acme'), 'no fragment of the argument may survive');
  // What it SHOULD carry: closed-vocabulary fields only.
  assert.deepEqual(Object.keys(out.accept).sort(), ['bytes', 'method', 'tool']);
});

test('a message with no method still yields a loggable shape rather than throwing', () => {
  const out = inspectMcpBody(JSON.stringify({ jsonrpc: '2.0', id: 1 }));
  assert.ok('accept' in out);
  assert.equal(out.accept.method, '<none>');
  assert.equal(out.accept.tool, undefined);
});

test('a non-tools/call method carries no tool field', () => {
  const out = inspectMcpBody(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
  assert.ok('accept' in out);
  assert.equal(out.accept.tool, undefined);
});

// --- watchdog ---
//
// Uses node:test mock timers rather than real waits. The load-bearing test is the LAST one:
// a pending setTimeout keeps the Node event loop alive, which is the exact mechanism that
// holds a Vercel invocation open - so a watchdog that failed to clear its own timers would
// CAUSE the hang it exists to observe.

import { mock } from 'node:test';
import { armMcpWatchdog } from '../../lib/mcpWatchdog';

const SHAPE = { method: 'tools/call', tool: 'recommend_mcp_for_task', bytes: 120 };

/** Run `fn` with console.error captured and mock timers enabled. */
function withCapture(fn: (lines: string[], tick: (ms: number) => void) => void): void {
  const lines: string[] = [];
  const real = console.error;
  console.error = (...a: unknown[]) => void lines.push(a.join(' '));
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    fn(lines, (ms) => mock.timers.tick(ms));
  } finally {
    mock.timers.reset();
    console.error = real;
  }
}

test('watchdog: a fast request logs NOTHING (no cost on the happy path)', () => {
  withCapture((lines, tick) => {
    const disarm = armMcpWatchdog(SHAPE);
    tick(300); // a normal request is ~250ms
    disarm();
    assert.deepEqual(lines, [], `expected silence, got: ${lines.join(' | ')}`);
  });
});

test('watchdog: past 10s it names the request shape', () => {
  withCapture((lines, tick) => {
    const disarm = armMcpWatchdog(SHAPE);
    tick(10_001);
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /mcp-slow 10s/);
    assert.match(lines[0]!, /method=tools\/call/);
    assert.match(lines[0]!, /tool=recommend_mcp_for_task/);
    disarm();
  });
});

test('watchdog: slow-but-finished is distinguishable from hung', () => {
  withCapture((lines, tick) => {
    const disarm = armMcpWatchdog(SHAPE);
    tick(10_001);
    disarm(); // finished
    // A completion line after the warning is what says "slow, not hung".
    assert.equal(lines.length, 2);
    assert.match(lines[1]!, /mcp-slow completed/);
  });
});

test('watchdog: a hang trips BOTH checkpoints and never logs completion', () => {
  withCapture((lines, tick) => {
    armMcpWatchdog(SHAPE); // never disarmed: the request is still running
    tick(60_000); // past the 60s platform ceiling
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /mcp-slow 10s/);
    assert.match(lines[1]!, /50s-near-kill/);
    assert.ok(!lines.some((l) => l.includes('completed')), 'a hang must not log completion');
  });
});

test('watchdog: disarm CLEARS its timers - an uncleared one would cause the hang it watches', () => {
  withCapture((lines, tick) => {
    const disarm = armMcpWatchdog(SHAPE);
    disarm();
    tick(120_000); // twice the platform ceiling
    assert.deepEqual(lines, [], 'no timer may survive disarm');
  });
});
