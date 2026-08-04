// Expiry overlay: read-time decay without erasing FAIL accusation signals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyContentDriftOverlay,
  applyExpiryOverlay,
  CONTENT_DRIFT_LIMIT,
  descriptionHash,
  EXPIRED_VERDICT_LIMIT,
  isVerdictExpired,
  coercePreviewBadge,
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
  const names = new Map([
    ['a', { name: 'io.github.example/a' }],
    ['b', { name: 'io.github.example/b' }],
  ]);
  const all = {
    a: withSubject('io.github.example/a'),
    b: withSubject('io.github.attacker/lookalike'),
  };
  const got = selectScreened(all, names, Date.parse('2026-07-21T12:00:00Z'));
  assert.deepEqual(got.map((r) => r.slug), ['a'],
    'a record naming a different server must not count toward published coverage');
});

test('selectScreened: keeps legacy records, drops fixtures and unknown slugs', () => {
  const names = new Map([['a', { name: 'io.github.example/a' }]]);
  const all = {
    a: withSubject(),                                    // legacy, no server_id
    fix: { ...withSubject('io.github.example/a'), fixture: true },
    ghost: withSubject('io.github.example/gone'),        // slug not in the catalog
  };
  const got = selectScreened(all, names, Date.parse('2026-07-21T12:00:00Z'));
  assert.deepEqual(got.map((r) => r.slug), ['a']);
});

// ---------------------------------------------------------------------------
// Content-drift overlay: the record's content_hash vs the description published NOW.
// Doctrine mirrors the expiry overlay: never coerce status away from an accusation.

test('applyContentDriftOverlay: clean drifted -> STALE + content_drift', () => {
  const v = { ...mk([{ id: DESC, verdict: 'PASS' }], ''), content_hash: descriptionHash('old text') };
  const out = applyContentDriftOverlay(v, 'new text');
  assert.equal(out.status, 'STALE');
  assert.ok(out.honest_limits?.includes(CONTENT_DRIFT_LIMIT));
});

test('applyContentDriftOverlay: drifted FAIL -> token only, status unchanged', () => {
  const v = { ...mk([{ id: DESC, verdict: 'FAIL' }], ''), content_hash: descriptionHash('old text') };
  const out = applyContentDriftOverlay(v, 'new text');
  assert.equal(out.status, 'PARTIAL',
    'an accusation must keep its status: marking it STALE would soften the signal');
  assert.ok(out.honest_limits?.includes(CONTENT_DRIFT_LIMIT));
});

test('applyContentDriftOverlay: unchanged description -> identity', () => {
  const v = { ...mk([{ id: DESC, verdict: 'PASS' }], ''), content_hash: descriptionHash('same') };
  assert.equal(applyContentDriftOverlay(v, 'same'), v);
});

test('applyContentDriftOverlay: unresolvable subject or hashless record -> identity', () => {
  const hashless = mk([{ id: DESC, verdict: 'PASS' }], '');
  assert.equal(applyContentDriftOverlay(hashless, 'anything'), hashless,
    'a legacy record with no content_hash has nothing to compare');
  const v = { ...mk([{ id: DESC, verdict: 'PASS' }], ''), content_hash: descriptionHash('old') };
  assert.equal(applyContentDriftOverlay(v, null), v,
    'fail-OPEN by design: unresolvable must not flip the site to STALE (AD-4b)');
});

test('applyContentDriftOverlay: idempotent, no duplicate token', () => {
  const v = { ...mk([{ id: DESC, verdict: 'PASS' }], ''), content_hash: descriptionHash('old') };
  const once = applyContentDriftOverlay(v, 'new');
  const twice = applyContentDriftOverlay(once, 'new');
  assert.equal(
    twice.honest_limits?.filter((l) => l === CONTENT_DRIFT_LIMIT).length, 1);
  assert.equal(twice.status, 'STALE');
});

test('both overlays compose: expired + drifted -> STALE with BOTH tokens', () => {
  const v = {
    ...mk([{ id: DESC, verdict: 'PASS' }], '2020-01-01T00:00:00Z'),
    content_hash: descriptionHash('old text'),
  };
  const out = applyContentDriftOverlay(applyExpiryOverlay(v, NOW), 'new text');
  assert.equal(out.status, 'STALE');
  assert.ok(out.honest_limits?.includes(EXPIRED_VERDICT_LIMIT));
  assert.ok(out.honest_limits?.includes(CONTENT_DRIFT_LIMIT));
});

test('selectVerdictForSubject: applies the content overlay from subject.description', () => {
  const rec = { ...withSubject('io.github.example/a'), content_hash: descriptionHash('judged') };
  const stale = selectVerdictForSubject(
    { a: rec },
    { slug: 'a', name: 'io.github.example/a', description: 'republished' },
  );
  assert.equal(stale?.status, 'STALE');
  assert.ok(stale?.honest_limits?.includes(CONTENT_DRIFT_LIMIT));
  const fresh = selectVerdictForSubject(
    { a: rec },
    { slug: 'a', name: 'io.github.example/a', description: 'judged' },
  );
  assert.equal(fresh?.status, rec.status);
  assert.ok(!fresh?.honest_limits?.includes(CONTENT_DRIFT_LIMIT));
});

test('selectScreened and selectVerdictForSubject agree on staleness', () => {
  // The leaderboard (selectScreened) and the server page (selectVerdictForSubject)
  // must never disagree about the same record - on a trust surface, the surfaces
  // disagreeing IS the defect this overlay exists to prevent.
  const rec = { ...withSubject('io.github.example/a'), content_hash: descriptionHash('judged') };
  const subjects = new Map([['a', { name: 'io.github.example/a', description: 'republished' }]]);
  const listed = selectScreened({ a: rec }, subjects, Date.parse('2026-07-21T12:00:00Z'));
  const paged = selectVerdictForSubject(
    { a: rec },
    { slug: 'a', name: 'io.github.example/a', description: 'republished' },
  );
  assert.equal(listed.length, 1);
  assert.equal(listed[0].verdict.status, paged?.status);
  assert.deepEqual(listed[0].verdict.honest_limits, paged?.honest_limits);
});

// ---- AD-3: owner-mediated disclosure on the preview badge -------------------------
// A credentialed badge is evidence the OWNER mediated: observed through a key they supplied,
// one vantage, one moment. The page renders it differently and the API lets consumers filter
// on it, so the coercion of this single boolean decides whether a reader is told at all.
test('preview badge: credentialed is strict-true only', () => {
  const base = {
    tier: 'preview', by: 'gb', confirmed_by: 'gb', state: 'clean',
    n_drift: 0, date: '2026-08-04', server_id: 'com.example/mcp',
    statement: 's', re_check_policy: 'p',
  };
  assert.equal(coercePreviewBadge({ ...base, credentialed: true })?.credentialed, true);
  // Absent is the overwhelmingly common case (every uncredentialed observation, and every
  // badge written before the field existed). It must read false, never undefined.
  assert.equal(coercePreviewBadge(base)?.credentialed, false);
  // Truthy non-booleans must NOT invent a disclosure. A store value of "false" is the nasty
  // one: it is truthy in JS, so a `!!` coercion would label an ordinary badge owner-mediated
  // and quietly cast doubt on a server whose owner handed us nothing.
  for (const bad of ['true', 'false', 1, 0, null, [], {}] as unknown[]) {
    assert.equal(
      coercePreviewBadge({ ...base, credentialed: bad })?.credentialed,
      false,
      `non-boolean ${JSON.stringify(bad)} must not read as credentialed`,
    );
  }
});
