// Expiry overlay: read-time decay without erasing FAIL accusation signals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyExpiryOverlay,
  EXPIRED_VERDICT_LIMIT,
  isVerdictExpired,
  selectScreened,
  selectVerdictForSubject,
  verdictBindsSubject,
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


// The subject binding. Until this existed the slug was the ONLY link between a verdict and
// the server it is about, which is how a slug bug escalated into a verdict rendered under
// someone else's name.
const SUBJECT = 'io.github.example/thing';

function withSubject(server_id?: string): Verdict {
  return { ...mk([{ id: DESC, verdict: 'PASS' }], ''), ...(server_id ? { server_id } : {}) };
}

test('verdictBindsSubject: a record naming ANOTHER server does not bind', () => {
  assert.equal(verdictBindsSubject(withSubject('io.github.attacker/lookalike'), SUBJECT), false);
  // Case matters: registry names are case-sensitive and two names differing only in case
  // slugify to the SAME base, which is precisely the collision this guard backstops.
  assert.equal(verdictBindsSubject(withSubject(SUBJECT.toUpperCase()), SUBJECT), false);
});

test('verdictBindsSubject: a record naming THIS server binds', () => {
  assert.equal(verdictBindsSubject(withSubject(SUBJECT), SUBJECT), true);
});

test('verdictBindsSubject: a legacy record with no server_id still binds', () => {
  // ~18,543 records predate the field. Failing them closed would blank the site; they rest
  // on the slug space being injective by construction instead.
  assert.equal(verdictBindsSubject(withSubject(), SUBJECT), true);
  assert.equal(verdictBindsSubject({ ...withSubject(), server_id: '' }, SUBJECT), true);
});

test('selectVerdictForSubject: refuses a record that names a DIFFERENT server', () => {
  const all = { 'the-slug': withSubject('io.github.attacker/lookalike') };
  assert.equal(selectVerdictForSubject(all, { slug: 'the-slug', name: SUBJECT }), null);
});

test('selectVerdictForSubject: serves a matching record, and a legacy one', () => {
  for (const rec of [withSubject(SUBJECT), withSubject()]) {
    const got = selectVerdictForSubject({ 'the-slug': rec }, { slug: 'the-slug', name: SUBJECT });
    assert.ok(got, 'a bound record must be served');
    assert.equal(got.status, rec.status);
  }
});

test('selectVerdictForSubject: a fixture and a prototype key never resolve', () => {
  const fixture = { ...withSubject(SUBJECT), fixture: true };
  assert.equal(selectVerdictForSubject({ 'the-slug': fixture }, { slug: 'the-slug', name: SUBJECT }), null);
  // `__proto__` must not resolve to Object.prototype and read as a verdict.
  assert.equal(selectVerdictForSubject({}, { slug: '__proto__', name: SUBJECT }), null);
  assert.equal(selectVerdictForSubject({}, { slug: 'absent', name: SUBJECT }), null);
});

test('selectScreened: excludes a record whose server_id names another server', () => {
  const names = new Map([['a', 'io.github.example/a'], ['b', 'io.github.example/b']]);
  const all = {
    a: withSubject('io.github.example/a'),
    b: withSubject('io.github.attacker/lookalike'),
  };
  const got = selectScreened(all, names, Date.parse('2026-07-21T12:00:00Z'));
  assert.deepEqual(got.map((r) => r.slug), ['a'],
    'a record naming a different server must not count toward published coverage');
});

test('selectScreened: keeps legacy records, drops fixtures and unknown slugs', () => {
  const names = new Map([['a', 'io.github.example/a']]);
  const all = {
    a: withSubject(),                                    // legacy, no server_id
    fix: { ...withSubject('io.github.example/a'), fixture: true },
    ghost: withSubject('io.github.example/gone'),        // slug not in the catalog
  };
  const got = selectScreened(all, names, Date.parse('2026-07-21T12:00:00Z'));
  assert.deepEqual(got.map((r) => r.slug), ['a']);
});
