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
} from '../src/trust.mjs';

function assertVerdictShape(v, { expectToolName } = {}) {
  // Required keys
  for (const k of [
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
  assert.equal(v.verdict_contract_version, '1.0.0');
  // V1 honest limits must always be present.
  for (const l of V1_HONEST_LIMITS) {
    assert.ok(v.honest_limits.includes(l), `missing v1 honest_limit: ${l}`);
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

test('checkToolTrust: ALLOW verdict normalizes dimensions and pins honest_limits', async () => {
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
  assertVerdictShape(v, { expectToolName: true });
  assert.equal(v.directive, 'ALLOW');
  assert.equal(v.status, 'EVALUATED');
  assert.equal(v.dimensions.length, 3); // bad_dim_no_id dropped
  const coerced = v.dimensions.find((d) => d.id === 'bad_verdict');
  assert.equal(coerced.verdict, 'UNVERIFIED');
  assert.equal(coerced.severity, 'INFO');
  // v1 floor still present plus the extra.
  assert.ok(v.honest_limits.includes('extra_caveat'));
  for (const l of V1_HONEST_LIMITS) assert.ok(v.honest_limits.includes(l));
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

// --- Contract version pin -----------------------------------------------

test('VERDICT_CONTRACT_VERSION is pinned to 1.0.0', () => {
  assert.equal(VERDICT_CONTRACT_VERSION, '1.0.0');
});
