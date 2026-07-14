// A2 GET /api/v1/trust/server/[server_id]  +  A3 GET /api/v1/trust/tool/[server_id]/[tool_name]
// JSON. Always 200 except 400 on a bad path param. Unknown/fixture → UNVERIFIED (fail-closed), never 404.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX } from './_harness';
import { GET as trustServer } from '../../app/api/v1/trust/server/[server_id]/route';
import { GET as trustTool } from '../../app/api/v1/trust/tool/[server_id]/[tool_name]/route';

const asObj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

// ---- A2 trust/server ----
test('trust/server: known server → 200 verdict, contract v1.0.0', async () => {
  const r = await callRoute(trustServer, `/api/v1/trust/server/${FIX.SCREENED}`, { params: { server_id: FIX.SCREENED } });
  assert.equal(r.status, 200);
  const b = asObj(r);
  assert.equal(b.verdict_contract_version, '1.0.0');
  assert.equal(b.subject.server_id, FIX.SCREENED);
  assert.equal(b.subject.tool_name, null);
  assert.equal(b.status, 'PARTIAL'); // advisory, conformance not run
  // the dimension that drives the badge/page must survive to the API
  assert.ok(Array.isArray(b.dimensions) && b.dimensions.some((d: any) => d.id === 'mcpindex.integrity.description'));
  // Load-bearing safety invariant: never a fabricated pass. Durable across conformance graduation
  // (a human-confirmed DENY becomes legitimate then); only a fake ALLOW is the fatal bug.
  assert.notEqual(b.directive, 'ALLOW');
});

test('trust/server: unknown slug → 200 UNVERIFIED (fail-closed, not 404)', async () => {
  const r = await callRoute(trustServer, `/api/v1/trust/server/${FIX.UNKNOWN}`, { params: { server_id: FIX.UNKNOWN } });
  assert.equal(r.status, 200);
  const b = asObj(r);
  assert.equal(b.directive, 'UNVERIFIED');
  assert.equal(b.status, 'ERROR');
  assert.deepEqual(b.dimensions, []);
});

test('trust/server: fixture slug → 200 UNVERIFIED (fixtures excluded)', async () => {
  const r = await callRoute(trustServer, `/api/v1/trust/server/${FIX.FIXTURE}`, { params: { server_id: FIX.FIXTURE } });
  assert.equal(asObj(r).directive, 'UNVERIFIED');
});

test('trust/server: over-long param (>256) → 400', async () => {
  const long = 'a'.repeat(300);
  const r = await callRoute(trustServer, `/api/v1/trust/server/${long}`, { params: { server_id: long } });
  assert.equal(r.status, 400);
});

test('trust/server: empty param → 400', async () => {
  const r = await callRoute(trustServer, '/api/v1/trust/server/', { params: { server_id: '' } });
  assert.equal(r.status, 400);
});

// ---- A3 trust/tool ----
test('trust/tool: known server + tool → 200, echoes tool_name', async () => {
  const r = await callRoute(trustTool, `/api/v1/trust/tool/${FIX.SCREENED}/read_file`, {
    params: { server_id: FIX.SCREENED, tool_name: 'read_file' },
  });
  assert.equal(r.status, 200);
  const b = asObj(r);
  assert.equal(b.subject.server_id, FIX.SCREENED);
  assert.equal(b.subject.tool_name, 'read_file');
});

test('trust/tool: unknown server → 200 UNVERIFIED (not 404)', async () => {
  const r = await callRoute(trustTool, `/api/v1/trust/tool/${FIX.UNKNOWN}/x`, {
    params: { server_id: FIX.UNKNOWN, tool_name: 'x' },
  });
  assert.equal(asObj(r).directive, 'UNVERIFIED');
});

test('trust/tool: missing tool_name → 400', async () => {
  const r = await callRoute(trustTool, `/api/v1/trust/tool/${FIX.SCREENED}/`, {
    params: { server_id: FIX.SCREENED, tool_name: '' },
  });
  assert.equal(r.status, 400);
});

test('trust/tool: missing server_id → 400', async () => {
  const r = await callRoute(trustTool, '/api/v1/trust/tool//read_file', { params: { server_id: '', tool_name: 'read_file' } });
  assert.equal(r.status, 400);
});
