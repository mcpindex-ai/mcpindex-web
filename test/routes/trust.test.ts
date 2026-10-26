// A2 GET /api/v1/trust/server/[server_id]  +  A3 GET /api/v1/trust/tool/[server_id]/[tool_name]
// JSON. Always 200 except 400 on a bad path param. Unknown/fixture → UNVERIFIED (fail-closed), never 404.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, screenedSlug } from './_harness';
import { GET as trustServer } from '../../app/api/v1/trust/server/[server_id]/route';
import { GET as trustTool } from '../../app/api/v1/trust/tool/[server_id]/[tool_name]/route';

const asObj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

// ---- A2 trust/server ----
test('trust/server: known server → 200 verdict, contract v1.1.0', async () => {
  const slug = await screenedSlug();
  const r = await callRoute(trustServer, `/api/v1/trust/server/${slug}`, { params: { server_id: slug } });
  assert.equal(r.status, 200);
  const b = asObj(r);
  // Pinned as a LITERAL, not imported from lib/verdictContract: importing the
  // constant would assert it equals itself and a bump would sail through. This is
  // the wire value a consumer actually sees, so it must be spelled out here.
  assert.equal(b.verdict_contract_version, '1.1.0');
  assert.equal(b.subject.server_id, slug);
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
  const slug = await screenedSlug();
  const r = await callRoute(trustTool, `/api/v1/trust/tool/${slug}/read_file`, {
    params: { server_id: slug, tool_name: 'read_file' },
  });
  assert.equal(r.status, 200);
  const b = asObj(r);
  assert.equal(b.subject.server_id, slug);
  assert.equal(b.subject.tool_name, 'read_file');
});

test('trust/tool: unknown server → 200 UNVERIFIED (not 404)', async () => {
  const r = await callRoute(trustTool, `/api/v1/trust/tool/${FIX.UNKNOWN}/x`, {
    params: { server_id: FIX.UNKNOWN, tool_name: 'x' },
  });
  assert.equal(asObj(r).directive, 'UNVERIFIED');
});

test('trust/tool: missing tool_name → 400', async () => {
  const slug = await screenedSlug();
  const r = await callRoute(trustTool, `/api/v1/trust/tool/${slug}/`, {
    params: { server_id: slug, tool_name: '' },
  });
  assert.equal(r.status, 400);
});

test('trust/tool: missing server_id → 400', async () => {
  const r = await callRoute(trustTool, '/api/v1/trust/tool//read_file', { params: { server_id: '', tool_name: 'read_file' } });
  assert.equal(r.status, 400);
});

// The docs and the contract name the param `server_id` and show a registry name. Before
// resolveVerdictSlug the registry-name form answered UNVERIFIED for a server whose slug form
// was screened, on both trust routes and the badge.
test('trust: the registry name binds to the same verdict as the slug', async () => {
  const { loadServers } = await import('../../lib/registry');
  const servers = await loadServers();
  const slug = await screenedSlug();
  const name = servers.find((s) => s.slug === slug)!.name;
  assert.equal(servers.filter((s) => s.name === name).length, 1, 'fixture needs a unique registry name');
  const bySlug = asObj(await callRoute(trustServer, `/api/v1/trust/server/${slug}`, { params: { server_id: slug } }));
  const byName = asObj(await callRoute(trustServer, `/api/v1/trust/server/x`, { params: { server_id: name } }));
  assert.notEqual(bySlug.directive, 'UNVERIFIED');
  assert.equal(byName.directive, bySlug.directive);
  assert.equal(byName.subject.server_id, name);
  const tool = asObj(await callRoute(trustTool, `/api/v1/trust/tool/x/y`, { params: { server_id: name, tool_name: 'y' } }));
  assert.equal(tool.directive, bySlug.directive);
});

test('resolveVerdictSlugIn: a registry name shared by two listings binds to nothing', async () => {
  const { resolveVerdictSlugIn } = await import('../../lib/verdicts');
  const row = (slug: string, name: string) => ({ slug, name, baseSlug: slug.split('--')[0] }) as never;
  const servers = [row('io-github-a-x--aaaa', 'io.github.a/x'), row('io-github-a-x--bbbb', 'io.github.a/x'), row('io-github-b-y', 'io.github.b/y')];
  assert.equal(resolveVerdictSlugIn('io.github.a/x', servers), null);
  assert.equal(resolveVerdictSlugIn('io.github.b/y', servers), 'io-github-b-y');
  assert.equal(resolveVerdictSlugIn('io-github-b-y', servers), 'io-github-b-y');
  assert.equal(resolveVerdictSlugIn('nothing-like-it', servers), null);
});

// The redirect heuristics (drop -mcp, unique prefix) are fine for a 308 a human watches land,
// and not for a verdict returned under the caller's id: they mapped removed servers and bare
// prefixes onto other servers' screens.
test('resolveVerdictSlugIn: heuristic renames and gone slugs never bind', async () => {
  const { resolveVerdictSlugIn, resolveVerdictSlug } = await import('../../lib/verdicts');
  const row = (slug: string) => ({ slug, name: slug, baseSlug: slug }) as never;
  const servers = [row('acme-status'), row('widget')];
  assert.equal(resolveVerdictSlugIn('acme', servers), null, 'unique prefix');
  assert.equal(resolveVerdictSlugIn('widget-mcp', servers), null, 'drop -mcp');
  const removals = (await import('../../data/server-removals.json')).default as { gone: Record<string, unknown> };
  const gone = Object.keys(removals.gone);
  assert.ok(gone.length > 0);
  for (const g of gone.slice(0, 50)) assert.equal(await resolveVerdictSlug(g), null, g);
});

test('resolveVerdictSlug: seeded SEO redirects never carry a verdict', async () => {
  const { resolveVerdictSlug } = await import('../../lib/verdicts');
  const removals = (await import('../../data/server-removals.json')).default as { redirects: Record<string, string> };
  const seeded = Object.keys(removals.redirects);
  assert.ok(seeded.length > 0);
  for (const s of seeded) assert.equal(await resolveVerdictSlug(s), null, s);
});
