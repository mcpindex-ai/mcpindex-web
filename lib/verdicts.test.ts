// Expiry overlay: read-time decay without erasing FAIL accusation signals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConfirmationOverlay,
  applyContentDriftOverlay,
  applyExpiryOverlay,
  applyListingDriftOverlay,
  CONTENT_DRIFT_LIMIT,
  descriptionHash,
  EXPIRED_VERDICT_LIMIT,
  FRESHNESS_CONFIRMED_LIMIT,
  LISTING_CHANGED_LIMIT,
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
  assert.equal(selectVerdictForSubject(all, { slug: 'the-slug', name: SUBJECT }, null), null);
});

test('selectVerdictForSubject: serves a matching record, and a legacy one', () => {
  for (const rec of [withSubject(SUBJECT), withSubject()]) {
    const got = selectVerdictForSubject({ 'the-slug': rec }, { slug: 'the-slug', name: SUBJECT }, null);
    assert.ok(got, 'a bound record must be served');
    assert.equal(got.status, rec.status);
  }
});

test('selectVerdictForSubject: a fixture and a prototype key never resolve', () => {
  const fixture = { ...withSubject(SUBJECT), fixture: true };
  assert.equal(selectVerdictForSubject({ 'the-slug': fixture }, { slug: 'the-slug', name: SUBJECT }, null), null);
  // `__proto__` must not resolve to Object.prototype and read as a verdict.
  assert.equal(selectVerdictForSubject({}, { slug: '__proto__', name: SUBJECT }, null), null);
  assert.equal(selectVerdictForSubject({}, { slug: 'absent', name: SUBJECT }, null), null);
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
  const got = selectScreened(all, names, Date.parse('2026-07-21T12:00:00Z'), null);
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
  const got = selectScreened(all, names, Date.parse('2026-07-21T12:00:00Z'), null);
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
    null,
  );
  assert.equal(stale?.status, 'STALE');
  assert.ok(stale?.honest_limits?.includes(CONTENT_DRIFT_LIMIT));
  const fresh = selectVerdictForSubject(
    { a: rec },
    { slug: 'a', name: 'io.github.example/a', description: 'judged' },
    null,
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
  const listed = selectScreened({ a: rec }, subjects, Date.parse('2026-07-21T12:00:00Z'), null);
  const paged = selectVerdictForSubject(
    { a: rec },
    { slug: 'a', name: 'io.github.example/a', description: 'republished' },
    null,
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

// ---------------------------------------------------------------------------
// Freshness confirmation overlay. The predicate that decides whether a verdict's
// window may be extended WITHOUT a fresh screen, so every fail-closed branch is
// pinned: a hole here silently extends trust we did not re-earn.
// ---------------------------------------------------------------------------

const FETCHED = '2026-07-21T00:00:00.000Z';
const CONFIRMED_AT = '2026-07-28T00:00:00.000Z'; // FETCHED + 7d

/** A record eligible for confirmation: current policy token, post-epoch, bound hash. */
function confirmable(overrides: Partial<Verdict> = {}): Verdict {
  return {
    ...mk([{ id: DESC, verdict: 'PASS' }], '2026-07-01T00:00:00Z'), // already expired at NOW
    honest_limits: ['screen_model_8b'],
    evaluated_at: '2026-06-01T00:00:00Z',
    content_hash: descriptionHash('judged'),
    ...overrides,
  };
}

test('confirmation: unchanged text under current policy extends the window', () => {
  const out = applyConfirmationOverlay(confirmable(), 'judged', FETCHED);
  assert.equal(out.directive.expires_at, CONFIRMED_AT, 'anchored to fetchedAt + TTL, not to now');
  assert.ok(out.honest_limits?.includes(FRESHNESS_CONFIRMED_LIMIT),
    'the reader must be told freshness came from confirmation, not a fresh screen');
  // And that is enough to clear the amber badge.
  assert.equal(applyExpiryOverlay(out, NOW).status, 'PARTIAL');
});

test('confirmation: a drifted description is never confirmed', () => {
  const out = applyConfirmationOverlay(confirmable(), 'republished', FETCHED);
  assert.equal(out.directive.expires_at, '2026-07-01T00:00:00Z', 'window untouched');
  assert.ok(!out.honest_limits?.includes(FRESHNESS_CONFIRMED_LIMIT));
});

test('confirmation: fail-closed on missing description, hash, or snapshot timestamp', () => {
  const rec = confirmable();
  for (const [desc, fetched, why] of [
    [null, FETCHED, 'unresolvable subject'],
    ['judged', null, 'no snapshot timestamp'],
    ['judged', 'not-a-date', 'unparseable snapshot timestamp'],
    ['judged', '', 'empty snapshot timestamp'],
  ] as Array<[string | null, string | null, string]>) {
    assert.equal(applyConfirmationOverlay(rec, desc, fetched).directive.expires_at,
      rec.directive.expires_at, `must not confirm: ${why}`);
  }
  const noHash = confirmable({ content_hash: undefined });
  assert.equal(applyConfirmationOverlay(noHash, 'judged', FETCHED).directive.expires_at,
    noHash.directive.expires_at, 'must not confirm a record with no content binding');
});

test('confirmation: a retired screen policy is never confirmed', () => {
  // A record from the 70B demand-priority lane carries NO `screen_model_8b` limit - that
  // token is a limitation disclosure, not a quality marker. It must still confirm: gating on
  // it would refuse the strongest evidence in the corpus and invite a re-screen that
  // DOWNGRADES 70B verdicts to 8B ones.
  const stronger = confirmable({ honest_limits: ['advisory'] });
  assert.notEqual(applyConfirmationOverlay(stronger, 'judged', FETCHED).directive.expires_at,
    stronger.directive.expires_at, 'a 70B-screened record must confirm like any other');
  // Screened before POLICY_EPOCH.
  const preEpoch = confirmable({ evaluated_at: '2025-11-01T00:00:00Z' });
  assert.equal(applyConfirmationOverlay(preEpoch, 'judged', FETCHED).directive.expires_at,
    preEpoch.directive.expires_at, 'a pre-epoch record must be re-screened, not confirmed');
  // Unparseable evaluated_at cannot be shown to be post-epoch.
  const undated = confirmable({ evaluated_at: undefined });
  assert.equal(applyConfirmationOverlay(undated, 'judged', FETCHED).directive.expires_at,
    undated.directive.expires_at, 'an undated record cannot be proven current');
});

test('confirmation: never SHORTENS an existing window', () => {
  const longer = confirmable({
    directive: { decision: 'REVIEW', rationale: '', expires_at: '2027-01-01T00:00:00Z' },
  });
  const out = applyConfirmationOverlay(longer, 'judged', FETCHED);
  assert.equal(out.directive.expires_at, '2027-01-01T00:00:00Z');
  assert.ok(!out.honest_limits?.includes(FRESHNESS_CONFIRMED_LIMIT),
    'no confirmation token when nothing was extended');
});

test('confirmation: a stalled snapshot stops extending (the dead-man switch)', () => {
  // fetchedAt frozen 30 days back: fetchedAt + 7d is still in the past, so the record
  // stays expired even though its text is unchanged. If the sync dies, badges go amber.
  const stalled = new Date(NOW - 30 * 864e5).toISOString();
  const out = applyConfirmationOverlay(confirmable(), 'judged', stalled);
  assert.equal(applyExpiryOverlay(out, NOW).status, 'STALE');
  assert.ok(applyExpiryOverlay(out, NOW).honest_limits?.includes(EXPIRED_VERDICT_LIMIT));
});

test('confirmation: cannot clear a FAIL accusation', () => {
  const flagged = confirmable({ dimensions: [{ id: DESC, verdict: 'FAIL', severity: 'CRITICAL' }] });
  const out = applyConfirmationOverlay(flagged, 'judged', FETCHED);
  assert.deepEqual(out.dimensions, flagged.dimensions, 'dimensions are never touched');
  assert.equal(out.status, flagged.status, 'status is never touched');
});

test('confirmation: drift stays authoritative when composed in selector order', () => {
  // Confirmation runs first, expiry second, drift last. A record whose text moved must end
  // STALE regardless of what confirmation did upstream.
  const rec = confirmable();
  const composed = applyContentDriftOverlay(
    applyExpiryOverlay(applyConfirmationOverlay(rec, 'republished', FETCHED), NOW),
    'republished',
  );
  assert.equal(composed.status, 'STALE');
  assert.ok(composed.honest_limits?.includes(CONTENT_DRIFT_LIMIT));
});

test('selectScreened and selectVerdictForSubject agree once confirmation is on', () => {
  const rec = { ...confirmable(), server_id: 'io.github.example/a' };
  const subject = { slug: 'a', name: 'io.github.example/a', description: 'judged' };
  const subjects = new Map([['a', { name: subject.name, description: subject.description }]]);
  // Anchored to the REAL clock, not the fixed NOW the other tests use: selectScreened takes
  // an injected `now` but selectVerdictForSubject reads Date.now() internally, so a fixed
  // test clock makes the two disagree about expiry for reasons that have nothing to do with
  // the rule under test. Production always drives both from the same real clock
  // (listScreened passes Date.now()), which is the case this pins.
  const nowMs = Date.now();
  const fetchedNow = new Date(nowMs).toISOString();
  const listed = selectScreened({ a: rec }, subjects, nowMs, fetchedNow);
  const paged = selectVerdictForSubject({ a: rec }, subject, fetchedNow);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].verdict.directive.expires_at, paged?.directive.expires_at);
  assert.deepEqual(listed[0].verdict.honest_limits, paged?.honest_limits);
  assert.equal(listed[0].verdict.status, paged?.status);
});

// ---------------------------------------------------------------------------
// Listing-drift disclosure. Reports, never gates - so the tests pin that it says
// the true thing AND that it leaves every decision field alone.
// ---------------------------------------------------------------------------

test('listing drift: a listing updated after the screen is disclosed', () => {
  const rec = { ...withSubject(SUBJECT), evaluated_at: '2026-06-01T00:00:00Z' };
  const out = applyListingDriftOverlay(rec, '2026-07-01T00:00:00Z');
  assert.ok(out.honest_limits?.includes(LISTING_CHANGED_LIMIT));
});

test('listing drift: a listing older than the screen says nothing', () => {
  const rec = { ...withSubject(SUBJECT), evaluated_at: '2026-07-01T00:00:00Z' };
  const out = applyListingDriftOverlay(rec, '2026-06-01T00:00:00Z');
  assert.ok(!out.honest_limits?.includes(LISTING_CHANGED_LIMIT));
  // Equal timestamps are not a change.
  const same = applyListingDriftOverlay(rec, '2026-07-01T00:00:00Z');
  assert.ok(!same.honest_limits?.includes(LISTING_CHANGED_LIMIT));
});

test('listing drift: an unusable timestamp makes no claim', () => {
  // Silence must mean "no claim", never "nothing changed".
  const rec = { ...withSubject(SUBJECT), evaluated_at: '2026-06-01T00:00:00Z' };
  for (const bad of [null, undefined, '', 'not-a-date']) {
    assert.ok(!applyListingDriftOverlay(rec, bad).honest_limits?.includes(LISTING_CHANGED_LIMIT));
  }
  const undated = { ...withSubject(SUBJECT), evaluated_at: undefined };
  assert.ok(!applyListingDriftOverlay(undated, '2026-07-01T00:00:00Z').honest_limits
    ?.includes(LISTING_CHANGED_LIMIT));
});

test('listing drift: reports without gating - no decision field moves', () => {
  const flagged: Verdict = {
    ...mk([{ id: DESC, verdict: 'FAIL' }], '2027-01-01T00:00:00Z'),
    evaluated_at: '2026-06-01T00:00:00Z',
  };
  const out = applyListingDriftOverlay(flagged, '2026-07-01T00:00:00Z');
  assert.equal(out.status, flagged.status);
  assert.deepEqual(out.dimensions, flagged.dimensions);
  assert.deepEqual(out.directive, flagged.directive);
  assert.ok(out.honest_limits?.includes(LISTING_CHANGED_LIMIT),
    'a flagged verdict still gets the disclosure - it is information, not a verdict change');
});

test('listing drift: idempotent, and both selectors agree', () => {
  const rec = { ...withSubject('io.github.example/a'), evaluated_at: '2026-06-01T00:00:00Z' };
  const once = applyListingDriftOverlay(rec, '2026-07-01T00:00:00Z');
  assert.deepEqual(applyListingDriftOverlay(once, '2026-07-01T00:00:00Z').honest_limits,
    once.honest_limits, 'must not append the token twice');

  const subject = {
    slug: 'a', name: 'io.github.example/a', description: 'judged',
    updatedAt: '2026-07-01T00:00:00Z',
  };
  const subjects = new Map([['a', {
    name: subject.name, description: subject.description, updatedAt: subject.updatedAt,
  }]]);
  const nowMs = Date.now();
  const listed = selectScreened({ a: rec }, subjects, nowMs, new Date(nowMs).toISOString());
  const paged = selectVerdictForSubject({ a: rec }, subject, new Date(nowMs).toISOString());
  assert.deepEqual(listed[0].verdict.honest_limits, paged?.honest_limits);
  assert.ok(paged?.honest_limits?.includes(LISTING_CHANGED_LIMIT));
});
