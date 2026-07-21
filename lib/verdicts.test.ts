// Expiry overlay: read-time decay without erasing FAIL accusation signals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExpiryOverlay,
  EXPIRED_VERDICT_LIMIT,
  isVerdictExpired,
  type Verdict,
  type Dimension,
} from './verdicts';

const DESC = 'mcpindex.integrity.description';

function mk(
  dims: Array<{ id: string; verdict: Dimension['verdict'] }>,
  expires_at: string,
  status: Verdict['status'] = 'PARTIAL',
): Verdict {
  return {
    schema_version: '1.0',
    status,
    directive: { decision: 'REVIEW', rationale: '', expires_at },
    dimensions: dims.map((d) => ({ ...d, severity: 'INFO' })),
    fixture: false,
  };
}

const NOW = Date.parse('2026-07-21T12:00:00Z');

test('isVerdictExpired: empty/invalid -> false', () => {
  assert.equal(isVerdictExpired(mk([{ id: DESC, verdict: 'PASS' }], ''), NOW), false);
  assert.equal(isVerdictExpired(mk([{ id: DESC, verdict: 'PASS' }], 'not-a-date'), NOW), false);
});

test('isVerdictExpired: now >= expires_at -> true', () => {
  assert.equal(
    isVerdictExpired(mk([{ id: DESC, verdict: 'PASS' }], '2026-07-21T12:00:00Z'), NOW),
    true,
  );
  assert.equal(
    isVerdictExpired(mk([{ id: DESC, verdict: 'PASS' }], '2026-07-21T12:00:01Z'), NOW),
    false,
  );
});

test('applyExpiryOverlay: clean expired -> STALE + expired_verdict', () => {
  const v = mk([{ id: DESC, verdict: 'PASS' }], '2020-01-01T00:00:00Z');
  const out = applyExpiryOverlay(v, NOW);
  assert.equal(out.status, 'STALE');
  assert.ok(out.honest_limits?.includes(EXPIRED_VERDICT_LIMIT));
});

test('applyExpiryOverlay: expired FAIL -> token only, status unchanged', () => {
  const v = mk([{ id: DESC, verdict: 'FAIL' }], '2020-01-01T00:00:00Z', 'PARTIAL');
  const out = applyExpiryOverlay(v, NOW);
  assert.equal(out.status, 'PARTIAL');
  assert.ok(out.honest_limits?.includes(EXPIRED_VERDICT_LIMIT));
});

test('applyExpiryOverlay: not expired -> identity', () => {
  const v = mk([{ id: DESC, verdict: 'PASS' }], '2099-01-01T00:00:00Z');
  const out = applyExpiryOverlay(v, NOW);
  assert.equal(out.status, 'PARTIAL');
  assert.equal(out.honest_limits, undefined);
});

test('applyExpiryOverlay: warm-cache flip when now advances', () => {
  const v = mk([{ id: DESC, verdict: 'PASS' }], '2026-07-01T00:00:00Z');
  assert.equal(applyExpiryOverlay(v, Date.parse('2026-06-30T00:00:00Z')).status, 'PARTIAL');
  assert.equal(applyExpiryOverlay(v, Date.parse('2026-07-01T00:00:00Z')).status, 'STALE');
});
