// Unit tests for the badge gate — the security-load-bearing logic that decides what a
// verdict shows publicly. Run with `npm test` (tsx + node:test). These lock the R6
// insulation: a deterministic schema-content FAIL must never be auto-cleared by a
// `cleared` SCREEN adjudication (fail-open) nor auto-escalated to public "flagged".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBadgeState, splitFlags } from './badge';
import type { Verdict, Dimension, AdjudicationDecision } from './verdicts';

const SCHEMA = 'mcpindex.integrity.schema_content';
const DESC = 'mcpindex.integrity.description';

type DimInput = { id: string; verdict: Dimension['verdict']; severity?: Dimension['severity'] };

function mkVerdict(dims: DimInput[], adj?: AdjudicationDecision): Verdict {
  return {
    schema_version: '1.0',
    status: 'PARTIAL',
    directive: { decision: 'REVIEW', rationale: '', expires_at: '' },
    dimensions: dims.map((d) => ({ severity: 'INFO', ...d })),
    fixture: false,
    ...(adj ? { adjudication: { decision: adj, reason: '', by: '', at: '' } } : {}),
  };
}

test('clean integrity PASS -> screened', () => {
  assert.equal(computeBadgeState(mkVerdict([{ id: DESC, verdict: 'PASS' }])), 'screened');
});

test('unreviewed screen FAIL -> review (held, never a public accusation)', () => {
  assert.equal(computeBadgeState(mkVerdict([{ id: DESC, verdict: 'FAIL' }])), 'review');
});

test('confirmed screen FAIL -> flagged (accusation gate: reachable only via confirmed)', () => {
  assert.equal(computeBadgeState(mkVerdict([{ id: DESC, verdict: 'FAIL' }], 'confirmed')), 'flagged');
});

test('cleared screen FAIL -> screened', () => {
  assert.equal(computeBadgeState(mkVerdict([{ id: DESC, verdict: 'FAIL' }], 'cleared')), 'screened');
});

test('schema_content FAIL alone -> review (never screened, never flagged)', () => {
  assert.equal(
    computeBadgeState(mkVerdict([{ id: SCHEMA, verdict: 'FAIL', severity: 'CRITICAL' }])),
    'review',
  );
});

test('R6 fail-open: a cleared SCREEN flag CANNOT clear an unreviewed schema_content FAIL', () => {
  const state = computeBadgeState(
    mkVerdict([{ id: DESC, verdict: 'FAIL' }, { id: SCHEMA, verdict: 'FAIL', severity: 'CRITICAL' }], 'cleared'),
  );
  assert.equal(state, 'review'); // the fail-open this guards: must NOT be 'screened'
});

test('confirmed SCREEN flag -> flagged even alongside a schema_content FAIL', () => {
  const state = computeBadgeState(
    mkVerdict([{ id: DESC, verdict: 'FAIL' }, { id: SCHEMA, verdict: 'FAIL', severity: 'CRITICAL' }], 'confirmed'),
  );
  assert.equal(state, 'flagged'); // driven by the human-confirmed screen flag
});

test('clean integrity + schema_content PASS -> screened', () => {
  assert.equal(
    computeBadgeState(mkVerdict([{ id: DESC, verdict: 'PASS' }, { id: SCHEMA, verdict: 'PASS' }])),
    'screened',
  );
});

test('schema_content UNVERIFIED does not block a clean screen -> screened', () => {
  assert.equal(
    computeBadgeState(mkVerdict([{ id: DESC, verdict: 'PASS' }, { id: SCHEMA, verdict: 'UNVERIFIED' }])),
    'screened',
  );
});

test('schema-only FAIL + confirmed adjudication -> review (no SCREEN flag to escalate)', () => {
  assert.equal(
    computeBadgeState(mkVerdict([{ id: SCHEMA, verdict: 'FAIL', severity: 'CRITICAL' }], 'confirmed')),
    'review',
  );
});

test('schema-only FAIL + cleared adjudication -> review (a screen clear cannot clear it)', () => {
  assert.equal(
    computeBadgeState(mkVerdict([{ id: SCHEMA, verdict: 'FAIL', severity: 'CRITICAL' }], 'cleared')),
    'review',
  );
});

test('null -> not-screened; STALE -> stale; ERROR -> not-screened', () => {
  assert.equal(computeBadgeState(null), 'not-screened');
  const v = mkVerdict([{ id: DESC, verdict: 'PASS' }]);
  assert.equal(computeBadgeState({ ...v, status: 'STALE' }), 'stale');
  assert.equal(computeBadgeState({ ...v, status: 'ERROR' }), 'not-screened');
});

test('splitFlags separates the schema-content axis from the screen axis', () => {
  const both = splitFlags(
    mkVerdict([{ id: DESC, verdict: 'FAIL' }, { id: SCHEMA, verdict: 'FAIL', severity: 'CRITICAL' }]),
  );
  assert.equal(both.schemaContentFail, true);
  assert.equal(both.screenFail, true);
  const schemaOnly = splitFlags(mkVerdict([{ id: SCHEMA, verdict: 'FAIL', severity: 'CRITICAL' }]));
  assert.equal(schemaOnly.schemaContentFail, true);
  assert.equal(schemaOnly.screenFail, false);
});
