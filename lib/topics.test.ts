import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PUBLISHER_SHARE,
  MIN_IMPLEMENTATIONS,
  MIN_PUBLISHERS,
  implementationsFor,
  isTopic,
  matchesTopic,
  publisherOf,
  topicEligibility,
  topicLabel,
} from './topics';
import type { IndexedServer } from './types';

function mk(name: string): IndexedServer {
  return {
    source: 'registry',
    slug: name.replace(/[^a-z0-9]/gi, '-').toLowerCase(),
    name,
    title: name,
    description: 'd',
    version: '1.0.0',
    category: 'other',
    publishedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    status: 'active',
    hasRemote: false,
    hasPackage: false,
    primaryTransport: null,
    envVars: [],
  };
}

/** n servers on the same topic, each from a distinct publisher. */
function spread(topic: string, n: number): IndexedServer[] {
  return Array.from({ length: n }, (_, i) => mk(`io.github.pub${i}/${topic}-mcp`));
}

test('publisherOf splits on the first slash', () => {
  assert.equal(publisherOf('ai.waystation/postgres'), 'ai.waystation');
  assert.equal(publisherOf('io.github.a/b/c'), 'io.github.a');
  assert.equal(publisherOf('noslash'), 'noslash');
});

test('matchesTopic is whole-token, not substring', () => {
  assert.ok(matchesTopic(mk('ai.waystation/postgres'), 'postgres'));
  assert.ok(matchesTopic(mk('x/postgres-aiops'), 'postgres'));
  assert.ok(matchesTopic(mk('x/read_only_postgres.server'), 'postgres'));
  // "postgresql" must not be counted as "postgres" - they are different products
  // and a comparison that conflates them is wrong, not merely noisy.
  assert.equal(matchesTopic(mk('x/postgresql-tools'), 'postgres'), false);
});

test('matchesTopic ignores the publisher namespace', () => {
  // A publisher named after a product must not pull every one of its servers onto
  // that product's comparison page.
  assert.equal(matchesTopic(mk('com.slack.internal/unrelated-thing'), 'slack'), false);
  assert.ok(matchesTopic(mk('com.slack.internal/slack-connector'), 'slack'));
});

test('a topic below the implementation floor is not eligible', () => {
  const e = topicEligibility(spread('slack', MIN_IMPLEMENTATIONS - 1), 'slack');
  assert.equal(e.eligible, false);
  assert.equal(e.implementations, MIN_IMPLEMENTATIONS - 1);
});

test('a topic clearing every threshold is eligible', () => {
  const e = topicEligibility(spread('slack', MIN_IMPLEMENTATIONS), 'slack');
  assert.equal(e.eligible, true);
  assert.equal(e.publishers, MIN_IMPLEMENTATIONS);
  assert.ok(e.topPublisherShare < MAX_PUBLISHER_SHARE);
});

test('too few publishers is not eligible even with many implementations', () => {
  const servers = Array.from({ length: 20 }, (_, i) =>
    mk(`io.github.pub${i % (MIN_PUBLISHERS - 1)}/slack-${i}`),
  );
  const e = topicEligibility(servers, 'slack');
  assert.ok(e.implementations >= MIN_IMPLEMENTATIONS);
  assert.equal(e.publishers, MIN_PUBLISHERS - 1);
  assert.equal(e.eligible, false);
});

test('one publisher dominating the topic is not a comparison (the arcgis shape)', () => {
  // 20 servers, 3 publishers, but one owns 18 of them: a vendor catalogue wearing a
  // comparison's clothes. This is exactly why the dominance clause exists.
  const servers = [
    ...Array.from({ length: 18 }, (_, i) => mk(`com.bulk/arcgis-${i}`)),
    mk('io.github.a/arcgis-tools'),
    mk('io.github.b/arcgis-helper'),
  ];
  const e = topicEligibility(servers, 'arcgis');
  assert.equal(e.implementations, 20);
  assert.equal(e.publishers, 3);
  assert.ok(e.topPublisherShare >= MAX_PUBLISHER_SHARE);
  assert.equal(e.eligible, false);
});

test('eligibility on an empty set does not divide by zero', () => {
  const e = topicEligibility([], 'slack');
  assert.equal(e.eligible, false);
  assert.equal(e.implementations, 0);
  assert.equal(e.topPublisherShare, 0);
});

test('isTopic gates the route to the curated list', () => {
  assert.ok(isTopic('slack'));
  assert.equal(isTopic('intelligence'), false);
  assert.equal(isTopic('../../etc/passwd'), false);
});

test('topicLabel returns real product casing, falling back to the slug', () => {
  assert.equal(topicLabel('github'), 'GitHub');
  assert.equal(topicLabel('postgres'), 'PostgreSQL');
  assert.equal(topicLabel('unknown-thing'), 'unknown-thing');
});

test('implementationsFor keeps input order for stable rendering', () => {
  const servers = [mk('a/slack-one'), mk('b/other'), mk('c/slack-two')];
  assert.deepEqual(
    implementationsFor(servers, 'slack').map((s) => s.name),
    ['a/slack-one', 'c/slack-two'],
  );
});
