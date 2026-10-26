// tools.test.mjs - tool input guards, upstream error handling and formatter parity with
// the hosted endpoint (app/api/[transport]/route.ts). Spawned servers point at a local
// HTTP stub, never at the live API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

import {
  formatSearch,
  formatRecommend,
  formatInstall,
  formatCompare,
  installMethods,
} from '../src/index.mjs';

const SERVER = fileURLToPath(new URL('../src/index.mjs', import.meta.url));
const ENVELOPE = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'tools-test', version: '0.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

// Stub API: /api/v1/server/<anything> answers with an HTML 404 like the real site does
// for an unrouted path, and every request is recorded.
async function startStub() {
  const seen = [];
  const http = createServer((req, res) => {
    seen.push(req.url);
    if (req.url.startsWith('/api/v1/search')) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'query too long' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<!DOCTYPE html><html><body>' + 'x'.repeat(40000) + '</body></html>');
  });
  http.listen(0, '127.0.0.1');
  await once(http, 'listening');
  return { base: `http://127.0.0.1:${http.address().port}`, seen, close: () => http.close() };
}

function startServer(apiBase) {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, MCPINDEX_NO_UPDATE_CHECK: '1', MCPINDEX_API_BASE: apiBase },
  });
  let buffer = '';
  let id = 0;
  const pending = new Map();
  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      const timer = setTimeout(() => reject(new Error(`no response to ${method}`)), 8000);
      pending.set(mid, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: mid, method, params: { ...params, _meta: ENVELOPE } }) + '\n');
    });
  return {
    call: (name, args) => request('tools/call', { name, arguments: args }),
    list: () => request('tools/list', {}),
    async stop() {
      child.kill();
      await once(child, 'exit').catch(() => {});
    },
  };
}

const textOf = (res) => res.result?.content?.[0]?.text ?? JSON.stringify(res.error ?? res);
const rejected = (res) => Boolean(res.error || res.result?.isError);

test('get_install_command / compare_servers: empty and traversal slugs are refused before any fetch', async () => {
  const stub = await startStub();
  const s = startServer(stub.base);
  try {
    for (const slug of ['', '.', '..', '../search', '%2e%2e', 'a/b']) {
      const r = await s.call('get_install_command', { server_slug: slug, client: 'cursor' });
      assert.ok(r.result.isError, slug);
      assert.equal(textOf(r), 'Error calling get_install_command: invalid server_slug');
    }
    const c = await s.call('compare_servers', { slugs: ['', ''] });
    assert.equal(textOf(c), 'Error calling compare_servers: invalid slug');
    assert.deepEqual(stub.seen, []);
  } finally {
    await s.stop();
    stub.close();
  }
});

test('a non-JSON upstream error body never reaches tool output; a short JSON reason does', async () => {
  const stub = await startStub();
  const s = startServer(stub.base);
  try {
    const r = await s.call('get_install_command', { server_slug: 'no-such-server', client: 'cursor' });
    assert.ok(r.result.isError);
    assert.equal(textOf(r), 'Error calling get_install_command: mcpindex API 404');
    const q = await s.call('search_mcp_servers', { query: 'x' });
    assert.equal(textOf(q), 'Error calling search_mcp_servers: mcpindex API 400: query too long');
  } finally {
    await s.stop();
    stub.close();
  }
});

test('search limit is an integer 1-50 (same bounds as the hosted endpoint)', async () => {
  const stub = await startStub();
  const s = startServer(stub.base);
  try {
    const list = await s.list();
    const schema = list.result.tools.find((t) => t.name === 'search_mcp_servers').inputSchema;
    assert.equal(schema.properties.limit.type, 'integer');
    assert.equal(schema.properties.limit.minimum, 1);
    assert.equal(schema.properties.limit.maximum, 50);
    for (const limit of [0, -3, 2.5, 51]) {
      const r = await s.call('search_mcp_servers', { query: 'postgres', limit });
      assert.ok(rejected(r), `limit ${limit} was accepted`);
    }
    // Rejected by the schema, so the stub never saw a search request.
    assert.equal(stub.seen.filter((u) => u.startsWith('/api/v1/search')).length, 0);
    const ok = await s.call('search_mcp_servers', { query: 'postgres', limit: 5 });
    assert.match(textOf(ok), /mcpindex API 400/); // reached the stub
  } finally {
    await s.stop();
    stub.close();
  }
});

test('get_install_command accepts zed', async () => {
  const stub = await startStub();
  const s = startServer(stub.base);
  try {
    const list = await s.list();
    const tool = list.result.tools.find((t) => t.name === 'get_install_command');
    assert.ok(tool.inputSchema.properties.client.enum.includes('zed'));
    const r = await s.call('get_install_command', { server_slug: 'x', client: 'zed' });
    // Past schema validation: it fetched and got the stub's 404.
    assert.equal(textOf(r), 'Error calling get_install_command: mcpindex API 404');
  } finally {
    await s.stop();
    stub.close();
  }
});

// --- formatter parity --------------------------------------------------

const LIVENESS = {
  confirmed_unavailable: '2026-07-23',
  evidence: { http_status: 404 },
};

test('formatSearch prints the source-liveness caveat and the provenance line', () => {
  const out = formatSearch({
    query: 'lona trading',
    total: 1,
    results: [
      {
        title: 'agency.lona/trading',
        name: 'agency.lona/trading',
        qualityScore: 74,
        category: 'other',
        description: 'd',
        url: 'https://mcpindex.ai/server/agency-lona-trading',
        sourceLiveness: LIVENESS,
      },
    ],
  });
  assert.ok(
    out.includes(
      '  ! Source repository not publicly accessible (HTTP 404, confirmed 2026-07-23); may be private or relocated.',
    ),
    out,
  );
  assert.ok(out.endsWith('\n\nSource: mcpindex.ai - advisory, semantic-only screen; not a safety verdict.'), out);
});

test('formatRecommend prints the caveat, Basis and anchor lines from provenance', () => {
  const rec = {
    rank: 1,
    title: 't',
    name: 'n',
    reasoning: 'r',
    qualityScore: 74,
    category: 'other',
    installs: { remote: 'https://mcp.example/mcp' },
    url: 'https://mcpindex.ai/server/n',
    sourceLiveness: LIVENESS,
  };
  const out = formatRecommend({
    task: 'x',
    recommendations: [rec],
    provenance: { basis: 'Relevance-dominant.', anchor: { bitcoin_block: 973017, verify: 'https://mcpindex.ai/trust#anchor' } },
    note: 'Relevance-dominant.',
  });
  assert.ok(out.includes('    ! Source repository not publicly accessible (HTTP 404, confirmed 2026-07-23)'), out);
  assert.ok(out.includes('\nBasis: Relevance-dominant.\n'), out);
  assert.ok(out.endsWith('Corpus anchored to Bitcoin block 973017 - verify: https://mcpindex.ai/trust#anchor'), out);
  assert.ok(!out.includes('Source: Relevance'), 'old note-based Source line is gone');
  // No provenance block -> the plain provenance line, never an empty header.
  const bare = formatRecommend({ task: 'x', recommendations: [] });
  assert.ok(bare.endsWith('Source: mcpindex.ai - advisory, semantic-only screen; not a safety verdict.'), bare);
});

test('formatInstall: a remote endpoint is not fenced as a bash command', () => {
  const out = formatInstall(
    {
      title: 'T',
      name: 'n',
      slug: 'n',
      installs: [{ client: 'remote', label: 'Remote endpoint', command: 'https://mcp.example/mcp', notes: 'Streamable HTTP.' }],
    },
    'cursor',
  );
  assert.ok(!out.includes('```bash'), out);
  assert.ok(out.includes('```\nhttps://mcp.example/mcp\n```'), out);
  assert.ok(out.includes('No cursor-specific config published'), out);
});

test('compare install column lists install methods, not the first client label', () => {
  const desktop = (cmd, args) => ({ client: 'claude-desktop', label: 'Claude Desktop (claude_desktop_config.json)', json: JSON.stringify({ mcpServers: { x: { command: cmd, args } } }) });
  const npmDocker = [desktop('npx', ['-y', '--', 'p']), { client: 'claude-code', command: 'claude mcp add x -- npx -y -- p' }, desktop('docker', ['run', '--rm', '-i', '--', 'img'])];
  assert.equal(installMethods(npmDocker), 'npm+docker');
  assert.equal(installMethods([{ client: 'remote', command: 'https://x' }, desktop('uvx', ['--', 'p'])]), 'remote+pypi');
  assert.equal(installMethods([]), 'manual');
  const table = formatCompare([{ name: 'a', category: 'c', qualityScore: 1, installs: npmDocker, envVars: [] }]);
  assert.ok(table.includes('npm+docker'), table);
  assert.ok(!table.includes('Claude Desktop'), table);
});
