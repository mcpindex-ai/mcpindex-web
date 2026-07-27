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
test('census figures match data/source-liveness.json', async () => {
  const raw = await fs.readFile(
    path.join(process.cwd(), 'data', 'source-liveness.json'),
    'utf8',
  );
  const doc = JSON.parse(raw) as {
    server_count: number;
    url_count: number;
    servers: Record<string, { url: string }>;
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

  // url_count is itself a claim; derive it independently so a wrong header value in the
  // artifact cannot make a wrong page figure look correct.
  const distinctUrls = new Set(Object.values(doc.servers).map((s) => s.url)).size;
  assert.equal(distinctUrls, doc.url_count, 'url_count must equal distinct repo URLs');
});
