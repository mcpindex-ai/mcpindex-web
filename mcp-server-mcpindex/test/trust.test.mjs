// trust.test.mjs - proves the fail-CLOSED invariant + response shape.
//
// Run with:  node --test test/trust.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkToolTrust,
  assessServer,
  VERDICT_CONTRACT_VERSION,
  V1_HONEST_LIMITS,
  isSafeSegment,
} from '../src/trust.mjs';

function assertVerdictShape(v, { expectToolName, expectFloor = true } = {}) {
  // Required keys
  for (const k of [
    'subject',
    'directive',
    'status',
    'granularity',
    'dimensions',
    'expires_at',
    'honest_limits',
    'verdict_contract_version',
    'server_id',
    'source_url',
    'fetched_at',
  ]) {
    assert.ok(k in v, `missing key: ${k}`);
  }
  assert.ok(['ALLOW', 'DENY', 'REVIEW', 'UNVERIFIED'].includes(v.directive));
  assert.ok(['EVALUATED', 'PARTIAL', 'STALE', 'ERROR'].includes(v.status));
  assert.ok(v.granularity === null || typeof v.granularity === 'string');
  assert.ok(Array.isArray(v.dimensions));
  assert.ok(Array.isArray(v.honest_limits));
  assert.match(v.verdict_contract_version, /^\d+\.\d+\.\d+$/);
  // The local floor is present on verdicts the client builds itself (fail-closed) and
  // when the API sent no limits; an API-supplied list is relayed verbatim instead.
  if (expectFloor) {
    for (const l of V1_HONEST_LIMITS) {
      assert.ok(v.honest_limits.includes(l), `missing v1 honest_limit: ${l}`);
    }
  }
  if (expectToolName) assert.equal(typeof v.tool_name, 'string');
}

// --- Fail-CLOSED invariants ---------------------------------------------

test('checkToolTrust: unreachable endpoint returns UNVERIFIED + status ERROR', async () => {
  const failingFetch = async () => {
    throw new Error('connection refused');
  };
  const v = await checkToolTrust({
    serverId: 'github',
    toolName: 'create_pull_request',
    apiBase: 'https://does-not-resolve.invalid',
    fetchImpl: failingFetch,
  });
  assertVerdictShape(v, { expectToolName: true });
  assert.equal(v.directive, 'UNVERIFIED');
  assert.equal(v.status, 'ERROR');
  assert.equal(v.dimensions.length, 0);
  // Must NEVER fail-open to ALLOW.
  assert.notEqual(v.directive, 'ALLOW');
  // unverified reason should be in honest_limits.
  assert.ok(v.honest_limits.some((l) => l.startsWith('unverified_reason:')));
});

test('checkToolTrust: HTTP 404 returns UNVERIFIED + status ERROR', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 404,
    async text() {
      return 'not found';
    },
  });
  const v = await checkToolTrust({
    serverId: 'unknown',
    toolName: 'mystery',
    fetchImpl,
  });
  assert.equal(v.directive, 'UNVERIFIED');
  assert.equal(v.status, 'ERROR');
});

test('checkToolTrust: timeout returns UNVERIFIED', async () => {
  const fetchImpl = async (_url, opts) =>
    new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  const v = await checkToolTrust({
    serverId: 'slow',
    toolName: 'x',
    fetchImpl,
    timeoutMs: 5,
  });
  assert.equal(v.directive, 'UNVERIFIED');
  assert.equal(v.status, 'ERROR');
  assert.ok(v.honest_limits.includes('unverified_reason:timeout'));
});

test('checkToolTrust: malformed payload returns UNVERIFIED', async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return null;
    },
  });
  const v = await checkToolTrust({
    serverId: 'x',
    toolName: 'y',
    fetchImpl,
  });
  assert.equal(v.directive, 'UNVERIFIED');
  assert.equal(v.status, 'ERROR');
});

test('checkToolTrust: missing args returns UNVERIFIED (does not throw)', async () => {
  const v = await checkToolTrust({ serverId: '', toolName: '' });
  assert.equal(v.directive, 'UNVERIFIED');
  assert.equal(v.status, 'ERROR');
});

// --- Happy path / shape -------------------------------------------------

test('checkToolTrust: ALLOW verdict normalizes dimensions and relays the API honest_limits verbatim', async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        directive: 'ALLOW',
        status: 'EVALUATED',
        dimensions: [
          { id: 'tool_safety', verdict: 'PASS', severity: 'INFO' },
          { id: 'auth_hygiene', verdict: 'PASS', severity: 'INFO' },
          { verdict: 'PASS', severity: 'INFO' }, // dropped - no id
          { id: 'bad_verdict', verdict: 'WAT', severity: 'WAT' }, // coerced
        ],
        expires_at: '2026-06-30T00:00:00Z',
        honest_limits: ['extra_caveat'],
      };
    },
  });
  const v = await checkToolTrust({
    serverId: 'github',
    toolName: 'list_issues',
    fetchImpl,
  });
  assertVerdictShape(v, { expectToolName: true, expectFloor: false });
  assert.equal(v.directive, 'ALLOW');
  assert.equal(v.status, 'EVALUATED');
  assert.equal(v.dimensions.length, 3); // bad_dim_no_id dropped
  const coerced = v.dimensions.find((d) => d.id === 'bad_verdict');
  assert.equal(coerced.verdict, 'UNVERIFIED');
  assert.equal(coerced.severity, 'INFO');
  // The API's list, not the API's list merged with the local floor.
  assert.deepEqual(v.honest_limits, ['extra_caveat']);
  assert.equal(v.expires_at, '2026-06-30T00:00:00Z');
  assert.equal(v.server_id, 'github');
  assert.equal(v.tool_name, 'list_issues');
});

test('checkToolTrust: unknown directive from server is downgraded to UNVERIFIED', async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { directive: 'TOTALLY_FINE', status: 'EVALUATED' };
    },
  });
  const v = await checkToolTrust({
    serverId: 'x',
    toolName: 'y',
    fetchImpl,
  });
  assert.equal(v.directive, 'UNVERIFIED');
});

test('checkToolTrust: PARTIAL status passes through (never masked as EVALUATED) + granularity kept', async () => {
  // This is what the live API emits for a description-level screen. The old client
  // coerced PARTIAL -> EVALUATED and dropped granularity, overstating completeness.
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { directive: 'REVIEW', status: 'PARTIAL', granularity: 'description-level' };
    },
  });
  const v = await checkToolTrust({ serverId: 's', toolName: 't', fetchImpl });
  assert.equal(v.status, 'PARTIAL');
  assert.equal(v.granularity, 'description-level');
  assert.equal(v.directive, 'REVIEW');
});

test('checkToolTrust: an UNKNOWN status is coerced DOWN to STALE, never up to EVALUATED', async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { directive: 'REVIEW', status: 'SOME_FUTURE_STATUS' };
    },
  });
  const v = await checkToolTrust({ serverId: 's', toolName: 't', fetchImpl });
  assert.equal(v.status, 'STALE'); // conservative, NOT 'EVALUATED'
  assert.equal(v.granularity, null); // absent granularity normalizes to null
});

// --- assess_server ------------------------------------------------------

test('assessServer: unreachable returns UNVERIFIED + status ERROR', async () => {
  const v = await assessServer({
    serverId: 'github',
    fetchImpl: async () => {
      throw new Error('boom');
    },
  });
  assertVerdictShape(v);
  assert.equal(v.directive, 'UNVERIFIED');
  assert.equal(v.status, 'ERROR');
  assert.equal('tool_name' in v, false); // server-level: no tool_name
});

test('assessServer: returns shape on REVIEW verdict', async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        directive: 'REVIEW',
        status: 'EVALUATED',
        dimensions: [{ id: 'aggregated', verdict: 'FAIL', severity: 'HIGH' }],
        expires_at: '2026-06-30T00:00:00Z',
      };
    },
  });
  const v = await assessServer({ serverId: 'github', fetchImpl });
  assert.equal(v.directive, 'REVIEW');
  assert.equal(v.dimensions[0].severity, 'HIGH');
});

// --- API pass-through (F1: the client used to rewrite the verdict) ------

// Verbatim from GET https://mcpindex.ai/api/v1/trust/tool/io-github-microsoft-playwright-mcp/browser_navigate
// (2026-10-25). The stdio client relabelled 1.1.0 as 1.0.0, dropped subject.tool_verified,
// and prepended conformance_monitored_not_enforced beside semantic_only_no_conformance.
const LIVE_TOOL_VERDICT = {
  subject: {
    server_id: 'io-github-microsoft-playwright-mcp',
    tool_name: 'browser_navigate',
    tool_verified: false,
  },
  status: 'PARTIAL',
  directive: 'REVIEW',
  granularity: 'description-level',
  dimensions: [{ id: 'mcpindex.integrity.description', verdict: 'PASS', severity: 'INFO' }],
  expires_at: '2026-11-14T16:09:03.616544+00:00',
  honest_limits: [
    'semantic_only_no_conformance',
    'calibrated_false_v1',
    'description_level_screen',
    'advisory',
    'registry_description_only_no_input_schema',
    'screen_model_8b',
    'tool_name_not_independently_verified',
  ],
  verdict_contract_version: '1.1.0',
};

const okJson = (body) => async () => ({ ok: true, async json() { return body; } });

test('checkToolTrust: the API verdict is carried through unchanged (version, subject, limits)', async () => {
  const v = await checkToolTrust({
    serverId: 'io-github-microsoft-playwright-mcp',
    toolName: 'browser_navigate',
    fetchImpl: okJson(LIVE_TOOL_VERDICT),
  });
  assertVerdictShape(v, { expectToolName: true, expectFloor: false });
  for (const k of Object.keys(LIVE_TOOL_VERDICT)) {
    assert.deepEqual(v[k], LIVE_TOOL_VERDICT[k], `field ${k} was altered`);
  }
  assert.equal(v.subject.tool_verified, false);
  assert.ok(!v.honest_limits.includes('conformance_monitored_not_enforced'));
  // Flat convenience fields are additive only.
  assert.equal(v.server_id, 'io-github-microsoft-playwright-mcp');
  assert.equal(v.tool_name, 'browser_navigate');
  assert.match(v.source_url, /\/api\/v1\/trust\/tool\/io-github-microsoft-playwright-mcp\/browser_navigate$/);
});

test('assessServer: server-level subject and API limits pass through', async () => {
  const raw = {
    ...LIVE_TOOL_VERDICT,
    subject: { server_id: 'io-github-microsoft-playwright-mcp', tool_name: null },
    honest_limits: LIVE_TOOL_VERDICT.honest_limits.slice(0, 6),
  };
  const v = await assessServer({ serverId: 'io-github-microsoft-playwright-mcp', fetchImpl: okJson(raw) });
  assert.deepEqual(v.subject, raw.subject);
  assert.deepEqual(v.honest_limits, raw.honest_limits);
  assert.equal(v.verdict_contract_version, '1.1.0');
});

test('checkToolTrust: a newer API contract version is never downgraded; a malformed one falls back', async () => {
  const newer = await checkToolTrust({ serverId: 's', toolName: 't', fetchImpl: okJson({ directive: 'REVIEW', status: 'PARTIAL', verdict_contract_version: '2.3.0' }) });
  assert.equal(newer.verdict_contract_version, '2.3.0');
  const junk = await checkToolTrust({ serverId: 's', toolName: 't', fetchImpl: okJson({ directive: 'REVIEW', status: 'PARTIAL', verdict_contract_version: 'latest<script>' }) });
  assert.equal(junk.verdict_contract_version, VERDICT_CONTRACT_VERSION);
});

test('checkToolTrust: no honest_limits from the API -> local floor (never an uncaveated verdict)', async () => {
  const v = await checkToolTrust({ serverId: 's', toolName: 't', fetchImpl: okJson({ directive: 'REVIEW', status: 'PARTIAL' }) });
  assert.deepEqual(v.honest_limits, [...V1_HONEST_LIMITS]);
  // Subject synthesized in the API's shape when the API omitted it.
  assert.deepEqual(v.subject, { server_id: 's', tool_name: 't', tool_verified: false });
});

test('fail-closed verdicts carry the API-shaped subject', async () => {
  const tool = await checkToolTrust({ serverId: 's', toolName: 't', fetchImpl: async () => { throw new Error('x'); } });
  assert.deepEqual(tool.subject, { server_id: 's', tool_name: 't', tool_verified: false });
  const server = await assessServer({ serverId: 's', fetchImpl: async () => { throw new Error('x'); } });
  assert.deepEqual(server.subject, { server_id: 's', tool_name: null });
});

// --- Path-segment guard (F4) -------------------------------------------

test('traversal / encoded traversal segments are refused without a fetch', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, async json() { return LIVE_TOOL_VERDICT; } };
  };
  for (const [serverId, toolName] of [['..', 'x'], ['.', 'x'], ['a/b', 'x'], ['ok', '%2e%2e'], ['%252e%252e', 'x'], ['ok', 'a\\b'], ['%E0', 'x']]) {
    const v = await checkToolTrust({ serverId, toolName, fetchImpl });
    assert.equal(v.directive, 'UNVERIFIED');
    assert.equal(v.status, 'ERROR');
    assert.ok(v.honest_limits.includes('unverified_reason:invalid_args'), `${serverId}/${toolName}`);
    assert.equal(v.source_url, '');
  }
  const s = await assessServer({ serverId: '..', fetchImpl });
  assert.ok(s.honest_limits.includes('unverified_reason:invalid_args'));
  assert.equal(calls, 0);
});

test('isSafeSegment admits real slugs and tool names', () => {
  for (const ok of ['io-github-microsoft-playwright-mcp', 'browser_navigate', 'a.b', 'x%20y', 'name@1.2.3']) {
    assert.equal(isSafeSegment(ok), true, ok);
  }
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', '%2e%2e', '%2F', '%252e%252e', 'a\u0000b', 7, null]) {
    assert.equal(isSafeSegment(bad), false, String(bad));
  }
});

// --- Contract version pin -----------------------------------------------

test('VERDICT_CONTRACT_VERSION matches the API contract (1.1.0)', () => {
  assert.equal(VERDICT_CONTRACT_VERSION, '1.1.0');
});
