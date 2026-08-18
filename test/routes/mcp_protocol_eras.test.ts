// One protocol test per era leg of /api/mcp - the first suite to drive the
// route module itself. Zero protocol-version coverage existed on either leg
// when #106 shipped a hand-rolled modern leg on a false premise and #107
// reverted it: both directions of that churn would have been caught here.
//
// Legacy leg: `initialize` negotiation (mcp-handler over
// @modelcontextprotocol/server 2.0's stateless fallback).
// Modern leg (revision 2026-07-28): `server/discover` under the per-request
// `_meta` envelope with mirrored `Mcp-*` headers - no initialize.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../app/api/[transport]/route';
import { callRoute } from './_harness';

const ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'route-test', version: '0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

// Responses come back as plain JSON or as an SSE `data:` frame depending on the
// leg; read the first JSON object either way.
function rpcPayload(text: string): any {
  for (let line of text.split('\n')) {
    line = line.trim();
    if (line.startsWith('data:')) line = line.slice(5).trim();
    if (!line.startsWith('{')) continue;
    return JSON.parse(line);
  }
  throw new Error(`no JSON-RPC payload in response: ${text.slice(0, 200)}`);
}

test('legacy leg: initialize echoes a supported version and identifies the server', async () => {
  const res = await callRoute(POST, '/api/mcp', {
    method: 'POST',
    params: { transport: 'mcp' },
    headers: { accept: 'application/json, text/event-stream' },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'route-test', version: '0' },
      },
    },
  });
  assert.equal(res.status, 200, res.text.slice(0, 300));
  const payload = rpcPayload(res.text);
  assert.equal(payload.result.protocolVersion, '2025-06-18');
  assert.equal(payload.result.serverInfo.name, 'mcpindex');
  assert.ok(payload.result.capabilities.tools);
});

test('legacy leg: a modern revision is not a legal initialize version - counter-offered, not accepted', async () => {
  const res = await callRoute(POST, '/api/mcp', {
    method: 'POST',
    params: { transport: 'mcp' },
    headers: { accept: 'application/json, text/event-stream' },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2026-07-28',
        capabilities: {},
        clientInfo: { name: 'route-test', version: '0' },
      },
    },
  });
  assert.equal(res.status, 200);
  assert.equal(rpcPayload(res.text).result.protocolVersion, '2025-11-25');
});

test('modern leg: server/discover answers 2026-07-28 with the envelope and mirrored headers', async () => {
  const res = await callRoute(POST, '/api/mcp', {
    method: 'POST',
    params: { transport: 'mcp' },
    headers: {
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'server/discover',
    },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: { _meta: ENVELOPE },
    },
  });
  assert.equal(res.status, 200, res.text.slice(0, 300));
  const payload = rpcPayload(res.text);
  assert.deepEqual(payload.result.supportedVersions, ['2026-07-28']);
  assert.equal(
    payload.result._meta['io.modelcontextprotocol/serverInfo'].name,
    'mcpindex',
  );
});

test('modern leg: a body/header mismatch is rejected, not served', async () => {
  // Same discover body, no mirrored Mcp-Method header: the library must refuse
  // (-32020 header/body disagreement) rather than quietly serve the modern
  // request. This is the conformance-enforcement half of the modern leg - the
  // part #106's hand-rolled interception silently loosened.
  const res = await callRoute(POST, '/api/mcp', {
    method: 'POST',
    params: { transport: 'mcp' },
    headers: {
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2026-07-28',
    },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: { _meta: ENVELOPE },
    },
  });
  const payload = rpcPayload(res.text);
  assert.ok(payload.error, `expected a JSON-RPC error, got: ${res.text.slice(0, 200)}`);
  assert.equal(payload.error.code, -32020);
});
