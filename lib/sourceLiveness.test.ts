import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
