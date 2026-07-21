/**
 * In-process /api/v1 dispatch tests (lib/v1Dispatch.ts).
 *
 * The remote-MCP endpoint (/api/mcp) resolves its five tool backends through this module.
 * It previously `fetch`ed https://mcpindex.ai over the network, which (a) funnelled every
 * MCP-driven hop into one `api:<egress-ip>` rate-limit bucket, and (b) made preview
 * deployments answer from PRODUCTION data. Neither had any test coverage.
 *
 * What these pin:
 *   - every path the MCP tools actually build is routable,
 *   - an unroutable path THROWS rather than resolving to a silent empty answer,
 *   - a non-2xx status throws and does NOT leak the upstream body,
 *   - percent-encoded slugs / tool names survive as literal values,
 *   - the dispatch really is in-process: it works with global fetch disabled.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeV1, callV1, withTimeout, ROUTE_BASE } from '@/lib/v1Dispatch';

const u = (p: string) => new URL(p, ROUTE_BASE);

test('every path shape the MCP tools build is routable', () => {
  const paths = [
    '/api/v1/recommend?task=read%20pdfs',
    '/api/v1/search?q=github&limit=5',
    '/api/v1/server/io-github-example-mcp',
    '/api/v1/trust/server/io-github-example-mcp',
    '/api/v1/trust/tool/io-github-example-mcp/create_pull_request',
  ];
  for (const p of paths) {
    const r = routeV1(u(p));
    assert.ok(r !== null, `expected a handler for ${p}`);
    // Don't leave the promise unhandled if the handler rejects on missing data.
    void Promise.resolve(r).catch(() => {});
  }
});

test('unroutable paths return null (never a silent empty answer)', () => {
  for (const p of [
    '/api/v2/search',
    '/api/v1',
    '/api/v1/nope',
    '/api/v1/trust',
    '/api/v1/trust/tool/only-one-segment',
    '/api/v1/server/a/b/c/d',
    '/healthz',
  ]) {
    assert.equal(routeV1(u(p)), null, `${p} should not route`);
  }
});

test('callV1 THROWS on an unroutable path', async () => {
  await assert.rejects(() => callV1('/api/v1/nope'), /unroutable path/);
});

test('percent-encoded segments arrive at the handler decoded', async () => {
  // A tool name with characters that must survive round-tripping through the URL.
  const toolName = 'create pull_request';
  const path = `/api/v1/trust/tool/${encodeURIComponent('io-github-example-mcp')}/${encodeURIComponent(toolName)}`;
  const body = await callV1<{ subject: { server_id: string; tool_name: string } }>(path);
  assert.equal(body.subject.tool_name, toolName);
  assert.equal(body.subject.server_id, 'io-github-example-mcp');
});

test('trust/tool states tool_verified:false and the not-independently-verified limit', async () => {
  // The endpoint returns the SERVER's screen for any tool name; it never confirms the tool
  // exists. That caveat must be on the wire, because check_tool_trust is the loudest consumer.
  const body = await callV1<{
    subject: { tool_verified: boolean };
    honest_limits: string[];
  }>('/api/v1/trust/tool/io-github-example-mcp/definitely-not-a-real-tool');
  assert.equal(body.subject.tool_verified, false);
  assert.ok(body.honest_limits.includes('tool_name_not_independently_verified'));
});

test('an unknown server still answers UNVERIFIED, fail-closed (not a throw, not a PASS)', async () => {
  const body = await callV1<{ status: string; directive: string }>(
    '/api/v1/trust/server/definitely-not-a-registered-server-xyz',
  );
  assert.equal(body.status, 'ERROR');
  assert.equal(body.directive, 'UNVERIFIED');
});

test('a non-2xx status throws WITHOUT leaking the upstream body', async () => {
  // /api/v1/server/<slug> 404s for an unknown slug. The error must carry the status only.
  await assert.rejects(
    () => callV1('/api/v1/server/definitely-not-a-registered-server-xyz'),
    (err: Error) => {
      assert.match(err.message, /^mcpindex API \d{3}$/);
      return true;
    },
  );
});

test('dispatch is genuinely IN-PROCESS: it works with global fetch disabled', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error('network call attempted - dispatch is not in-process');
  }) as typeof fetch;
  try {
    const body = await callV1<{ subject: unknown }>(
      '/api/v1/trust/server/definitely-not-a-registered-server-xyz',
    );
    assert.ok(body.subject, 'expected a real response with fetch disabled');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('withTimeout: rejects when the work outlasts the ceiling', async () => {
  const slow = new Promise<string>((r) => setTimeout(() => r('too late'), 200));
  await assert.rejects(() => withTimeout(slow, 10), /mcpindex API timeout/);
});

test('withTimeout: a fast success is never spuriously rejected', async () => {
  assert.equal(await withTimeout(Promise.resolve('ok'), 10_000), 'ok');
});

test('withTimeout: a fast success does not hold the event loop for the full ceiling', async () => {
  // Regression guard for a leaked timer: with a 60s ceiling and no clearTimeout, this test
  // file would sit open for a minute after the assertions finished.
  const started = Date.now();
  await withTimeout(Promise.resolve('ok'), 60_000);
  assert.ok(Date.now() - started < 1000);
});

test('a real dispatch still succeeds under the production ceiling', async () => {
  const body = await callV1<{ subject: unknown }>(
    '/api/v1/trust/server/definitely-not-a-registered-server-xyz',
  );
  assert.ok(body.subject);
});
