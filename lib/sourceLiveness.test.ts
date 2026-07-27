import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  SOURCE_LIVENESS_CENSUS,
  coerceSourceLiveness,
  livenessRecommendation,
  livenessSentence,
  type SourceLiveness,
} from './sourceLiveness';

const OK = {
  generated_at: '2026-07-20T07:30:00Z',
  servers: {
    'com.example/x': {
      state: 'unavailable',
      url: 'https://github.com/owner/repo',
      last_verified_accessible: '2026-07-13',
      confirmed_unavailable: '2026-07-22',
      evidence: {
        http_status: 404,
        vantages: 2,
        methods: ['github-api-authenticated', 'github-web-unauthenticated'],
      },
    },
  },
};

test('coercion: a well-formed two-vantage row survives', () => {
  const doc = coerceSourceLiveness(OK);
  assert.equal(Object.keys(doc.servers).length, 1);
  assert.equal(doc.servers['com.example/x'].evidence.http_status, 404);
});

test('coercion: a single-vantage row is DROPPED even if the file says publish', () => {
  const one = structuredClone(OK);
  one.servers['com.example/x'].evidence.vantages = 1;
  assert.deepEqual(coerceSourceLiveness(one).servers, {});
});

test('coercion: unknown states are dropped (closed vocabulary)', () => {
  const bad = structuredClone(OK) as unknown as {
    servers: Record<string, { state: string }>;
  };
  bad.servers['com.example/x'].state = 'gone';
  assert.deepEqual(coerceSourceLiveness(bad).servers, {});
});

test('coercion: non-https or missing url is dropped', () => {
  const bad = structuredClone(OK);
  (bad.servers['com.example/x'] as { url: string }).url = 'javascript:alert(1)';
  assert.deepEqual(coerceSourceLiveness(bad).servers, {});
});

test('coercion: garbage input yields an empty doc, never a throw', () => {
  for (const junk of [null, 42, 'x', [], {}, { servers: 7 }]) {
    assert.deepEqual(coerceSourceLiveness(junk).servers, {});
  }
});

test('copy: publishes the observation, never the inference', () => {
  const l = coerceSourceLiveness(OK).servers['com.example/x'];
  const s = livenessSentence(l);
  // The load-bearing invariant: four of six spec reviewers independently
  // flagged inference-language as the highest-risk line in the feature,
  // because a 404 cannot tell a deleted repo from a private one.
  for (const banned of ['gone', 'vanished', 'dead', 'abandoned', 'deleted', 'removed']) {
    assert.ok(!s.toLowerCase().includes(banned), `must not say "${banned}": ${s}`);
  }
  assert.ok(s.includes('no longer publicly accessible'));
  assert.ok(s.includes('may be deliberate'));
  assert.ok(s.includes('2026-07-13'), 'must show when it was last verified alive');
  assert.ok(s.includes('404'), 'must show the observed status');
});

test('copy: omits the date clause cleanly when never seen alive', () => {
  const l: SourceLiveness = {
    ...coerceSourceLiveness(OK).servers['com.example/x'],
    last_verified_accessible: null,
  };
  const s = livenessSentence(l);
  assert.ok(!s.includes('last verified'));
  assert.ok(s.includes('no longer publicly accessible'));
});

test('recommendation: severity keys on distribution type', () => {
  assert.match(livenessRecommendation(true), /pin_version/);
  assert.match(livenessRecommendation(false), /informational_only/);
});

// The published census figures must match the committed artifact. This exists because
// /research/source-liveness shipped the raw pre-debounce sweep (1,834 repos / 2,073
// servers) while citing a DOI that says 1,830 / 2,069, and sat wrong in production for
// four days. A comment saying "these must match aggregates.json" is not a check.
// Checked against the DOI-DEPOSITED aggregates, not data/source-liveness.json. Those are two
// different populations, and conflating them broke this test the first time the operational
// file refreshed. The census is a FROZEN, citable artifact (sweep-20260720, ots_anchored,
// DOI 10.5281/zenodo.21501868); source-liveness.json rolls forward on every re-check - it read
// 2,069 on 2026-07-23 and 2,065 on 2026-07-27 as four repos came back. The page cites the DOI,
// so tracking the rolling file would silently break the citation, which is what the FIG block's
// own comment warns against. Enforcing it mechanically was right; the source of truth was not.
test('census figures match the DOI-deposited aggregates', async () => {
  const raw = await fs.readFile(
    path.join(
      process.cwd(), '..', 'tasks', 'growth', 'doi-deposition-liveness-v1', 'aggregates.json',
    ),
    'utf8',
  );
  const agg = JSON.parse(raw) as {
    repositories: { not_publicly_accessible: number; servers_affected: number; corroborated: number };
  };
  const doc = {
    server_count: agg.repositories.servers_affected,
    url_count: agg.repositories.not_publicly_accessible,
    servers: {} as Record<string, { url: string }>,
  };

  const parse = (s: string) => Number(s.replace(/,/g, ''));

  assert.equal(
    parse(SOURCE_LIVENESS_CENSUS.serversAffected),
    doc.server_count,
    'serversAffected must equal server_count in data/source-liveness.json',
  );
  assert.equal(
    parse(SOURCE_LIVENESS_CENSUS.reposUnreachable),
    doc.url_count,
    'reposUnreachable must equal url_count in data/source-liveness.json',
  );

  // Keep the original intent - do not let one header value validate itself - but cross-check
  // against a SECOND independent field in the same deposited artifact. The per-server map the
  // old version counted lives in the rolling operational file, which is a different population
  // and would reintroduce the conflation this test was just corrected for.
  assert.equal(
    agg.repositories.corroborated,
    doc.url_count,
    'corroborated must equal not_publicly_accessible in the deposited aggregates',
  );
});

// pctUnreachable and ratioPhrase are DERIVED from the two enforced figures, so they can
// be internally wrong while every other guard stays green: the llms/page tests only prove
// a surface interpolates the constant, not that the constant is arithmetically true.
test('derived census figures match the enforced raw figures', () => {
  const n = (s: string) => Number(s.replace(/[,%]/g, ''));
  const unreachable = n(SOURCE_LIVENESS_CENSUS.reposUnreachable);
  const total = n(SOURCE_LIVENESS_CENSUS.reposTotal);
  const pct = (unreachable / total) * 100;

  assert.equal(
    n(SOURCE_LIVENESS_CENSUS.pctUnreachable).toFixed(1),
    pct.toFixed(1),
    `pctUnreachable must equal ${unreachable}/${total} = ${pct.toFixed(1)}%`,
  );

  // "one in seven" must round-trip: 1/7 = 14.3%, and the true rate must land nearer 7
  // than 6 or 8, otherwise the phrase contradicts the percentage beside it.
  const oneInN = total / unreachable;
  assert.equal(
    Math.round(oneInN),
    7,
    `ratioPhrase says "one in seven" but the rate is one in ${oneInN.toFixed(2)}`,
  );
});
