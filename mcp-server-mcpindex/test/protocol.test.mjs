// Protocol-era coverage for the stdio server: one spawned process per case
// (serveStdio pins the era per connection, so eras can't share a process).
// Legacy = initialize handshake (2025-11-25 and earlier). Modern = 2026-07-28
// per-request _meta envelope, no initialize. These tests are what was missing
// when the hosted endpoint's era support had to be settled by probing prod.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../src/index.mjs', import.meta.url));
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const META_CLIENT_INFO = 'io.modelcontextprotocol/clientInfo';
const META_CLIENT_CAPS = 'io.modelcontextprotocol/clientCapabilities';
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo';

const MODERN_ENVELOPE = {
  [META_VERSION]: '2026-07-28',
  [META_CLIENT_INFO]: { name: 'protocol-test', version: '0.0.0' },
  [META_CLIENT_CAPS]: {},
};

function startServer(env = {}) {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    // No registry GET from spawned servers: the update check is fail-silent
    // network egress the protocol tests never want.
    env: { ...process.env, MCPINDEX_NO_UPDATE_CHECK: '1', ...env },
  });
  let buffer = '';
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  return {
    child,
    request(msg, timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`no response to id ${msg.id} within ${timeoutMs}ms`)),
          timeoutMs,
        );
        pending.set(msg.id, (m) => {
          clearTimeout(timer);
          resolve(m);
        });
        child.stdin.write(JSON.stringify(msg) + '\n');
      });
    },
    notify(msg) {
      child.stdin.write(JSON.stringify(msg) + '\n');
    },
    async stop() {
      child.kill();
      await once(child, 'exit').catch(() => {});
    },
  };
}

test('legacy: initialize echoes a supported version and advertises tools', async () => {
  const s = startServer();
  try {
    const res = await s.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'protocol-test', version: '0.0.0' },
      },
    });
    assert.equal(res.result.protocolVersion, '2025-06-18');
    assert.equal(res.result.serverInfo.name, 'mcp-server-mcpindex');
    assert.ok(res.result.capabilities.tools);

    s.notify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const list = await s.request({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'assess_server',
      'check_tool_trust',
      'compare_servers',
      'get_install_command',
      'recommend_mcp_for_task',
      'search_mcp_servers',
    ]);
    for (const tool of list.result.tools) {
      assert.equal(typeof tool.title, 'string', `${tool.name} lost its title on the wire`);
      assert.equal(tool.inputSchema.type, 'object');
    }
  } finally {
    await s.stop();
  }
});

test('legacy: unknown requested version is counter-offered, not errored', async () => {
  const s = startServer();
  try {
    const res = await s.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        // A modern revision is not a legal initialize version; the server must
        // counter-offer its newest legacy revision (SDK 1.x did the same).
        protocolVersion: '2026-07-28',
        capabilities: {},
        clientInfo: { name: 'protocol-test', version: '0.0.0' },
      },
    });
    assert.equal(res.result.protocolVersion, '2025-11-25');
  } finally {
    await s.stop();
  }
});

test('modern: server/discover answers 2026-07-28 with no initialize', async () => {
  const s = startServer();
  try {
    const res = await s.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: { _meta: MODERN_ENVELOPE },
    });
    assert.deepEqual(res.result.supportedVersions, ['2026-07-28']);
    assert.ok(res.result.capabilities.tools);
    assert.equal(res.result._meta[META_SERVER_INFO].name, 'mcp-server-mcpindex');
  } finally {
    await s.stop();
  }
});

test('modern: tools/list serves all six tools under the envelope', async () => {
  const s = startServer();
  try {
    const res = await s.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { _meta: MODERN_ENVELOPE },
    });
    assert.equal(res.result.tools.length, 6);
    assert.equal(res.result._meta[META_SERVER_INFO].name, 'mcp-server-mcpindex');
  } finally {
    await s.stop();
  }
});

test('modern: tools/call runs a real tool end-to-end (fail-closed trust verdict, no network)', async () => {
  // Port 9 (discard) refuses immediately; checkToolTrust converts that into its
  // fail-closed UNVERIFIED verdict, so this exercises the full modern call path
  // without depending on the live API.
  const s = startServer({ MCPINDEX_API_BASE: 'http://127.0.0.1:9' });
  try {
    const res = await s.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'check_tool_trust',
        arguments: { server_id: 'io-github-example-example', tool_name: 'do_thing' },
        _meta: MODERN_ENVELOPE,
      },
    });
    assert.ok(!res.error, JSON.stringify(res.error));
    const verdict = JSON.parse(res.result.content[0].text);
    assert.equal(verdict.directive, 'UNVERIFIED');
  } finally {
    await s.stop();
  }
});

test('modern: tools/call with arguments violating the schema is rejected before the handler', async () => {
  const s = startServer({ MCPINDEX_API_BASE: 'http://127.0.0.1:9' });
  try {
    const res = await s.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'check_tool_trust',
        arguments: { server_id: 'x' }, // tool_name missing (required)
        _meta: MODERN_ENVELOPE,
      },
    });
    // The library owns argument validation now (fromJsonSchema's validator);
    // either a JSON-RPC error or an isError result is acceptable, silence is not.
    assert.ok(res.error || res.result.isError, JSON.stringify(res));
  } finally {
    await s.stop();
  }
});

test('importing the module has no side effects and exposes the library surface', async () => {
  const mod = await import('../src/index.mjs');
  assert.equal(typeof mod.buildServer, 'function');
  assert.equal(typeof mod.checkToolTrust, 'function');
  assert.equal(typeof mod.assessServer, 'function');
  assert.equal(mod.VERDICT_CONTRACT_VERSION, '1.0.0');
});
