// Unit tests for the defensive change-kind coercion (read side, M3/M4). The Upstash blob/meta is
// operator/attacker-controllable, so coerceChangeKinds is the gate that keeps the public page/API
// to a fixed allowlist. Run with `npx tsx --test lib/changeKinds.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceChangeKinds,
  SURFACE_CHANGE_KINDS,
  CONTEXT_SURFACE_CHANGE_KINDS,
  SAFETY_RELEVANT_CHANGE_KINDS,
  BENIGN_AUTOACCEPT_CHANGE_KINDS,
  BEHAVIORAL_MANDATED_CHANGE_KINDS,
  postureOutcome,
  isSafetyRelevant,
  MAX_CHANGE_KINDS,
} from './changeKinds';

test('accepts a known-kind array: validated, deduped, sorted', () => {
  assert.deepEqual(
    coerceChangeKinds(['type-changed', 'added-required-param', 'type-changed']),
    ['added-required-param', 'type-changed'],
  );
});

test('accepts a JSON-string-of-array (Upstash auto-deser ambiguity)', () => {
  assert.deepEqual(coerceChangeKinds('["annotation-flip-to-destructive"]'), [
    'annotation-flip-to-destructive',
  ]);
});

test('drops unknown / non-string / hostile entries, keeps known', () => {
  assert.deepEqual(
    coerceChangeKinds(['<script>alert(1)</script>', 'DROP TABLE', 42, null, 'removed-param']),
    ['removed-param'],
  );
  assert.deepEqual(coerceChangeKinds(['not-a-real-kind']), []);
});

test('non-array / unparseable / nullish -> [] (never throws)', () => {
  assert.deepEqual(coerceChangeKinds(undefined), []);
  assert.deepEqual(coerceChangeKinds(null), []);
  assert.deepEqual(coerceChangeKinds('{not json'), []);
  assert.deepEqual(coerceChangeKinds('"a string"'), []); // valid JSON, not an array
  assert.deepEqual(coerceChangeKinds(123), []);
  assert.deepEqual(coerceChangeKinds({ kinds: ['type-changed'] }), []);
});

test('bounds a hostile oversized array to MAX_CHANGE_KINDS distinct', () => {
  // 10k entries, but only the known taxonomy can survive - and the cap holds regardless.
  const huge = Array.from({ length: 10_000 }, (_, i) => `kind-${i}`);
  assert.equal(coerceChangeKinds(huge).length, 0); // all unknown -> dropped
  const realDupes = Array.from({ length: 10_000 }, () => 'type-changed');
  assert.deepEqual(coerceChangeKinds(realDupes), ['type-changed']); // dedup, bounded
  assert.ok(coerceChangeKinds([...SURFACE_CHANGE_KINDS]).length <= MAX_CHANGE_KINDS);
});

test('the allowlist matches the trust SURFACE_KINDS taxonomy member-for-member', () => {
  // Pin the FULL sorted member list (not just size) so a 1-for-1 swap vs. the trust-side
  // SURFACE_KINDS - which would silently drop a real kind from the public page - fails the build.
  assert.deepEqual([...SURFACE_CHANGE_KINDS].sort(), [
    'added-optional-param',
    'added-required-param',
    'annotation-flip-to-destructive',
    'constraint-narrowed',
    'deep-schema-undiffable',
    'enum-values-removed',
    'output-schema-added',
    'output-schema-changed',
    'param-mirrored-to-header',
    'removed-param',
    'required-set-expanded',
    'tool-removed',
    'type-changed',
  ]);
  assert.ok(!SURFACE_CHANGE_KINDS.has('description-only')); // never surfaced (cosmetic churn)
  assert.ok(!SURFACE_CHANGE_KINDS.has('tool-added')); // not drift of an existing dependency
});

// Server-scoped context-surface kinds are a SEPARATE set, accepted FORWARD-COMPAT (the
// drain's emit leg for "(server)" rows is unbuilt as of 2026-08-19), and they must never
// join the gate-behaviour surface that POSTURE_ROWS is generated from (the gate does not
// detect them).
test('the context-surface set is exactly the safety-relevant server-scoped kinds', () => {
  assert.deepEqual([...CONTEXT_SURFACE_CHANGE_KINDS].sort(), [
    'instructions-added',
    'instructions-changed',
    'prompt-args-changed',
  ]);
  // Cosmetic context kinds are stored corpus-side, never surfaced - so the public
  // allowlist must keep dropping them (the description-only precedent).
  for (const k of [
    'instructions-removed',
    'instructions-numeric',
    'prompt-added',
    'prompt-removed',
    'prompt-description-changed',
  ]) {
    assert.ok(!CONTEXT_SURFACE_CHANGE_KINDS.has(k), `${k} must not be surfaced`);
    assert.deepEqual(coerceChangeKinds([k]), [], `${k} must be dropped by the coercion gate`);
  }
  // The two accepted sets stay disjoint: a member of both would re-enter POSTURE_ROWS.
  for (const k of CONTEXT_SURFACE_CHANGE_KINDS) {
    assert.ok(!SURFACE_CHANGE_KINDS.has(k), `${k} must not join the gate-behaviour surface`);
  }
});

test('coercion accepts context-surface kinds from the untrusted blob', () => {
  assert.deepEqual(
    coerceChangeKinds(['instructions-changed', 'prompt-args-changed', 'instructions-changed']),
    ['instructions-changed', 'prompt-args-changed'],
  );
});

// The safety bit is MIRRORED from mcpindex-trust/corpus_eval/tooling/cse/schema_diff.py
// (`_SAFETY_RELEVANT`). Pinning the membership here is what makes the mirror safe: an upstream
// taxonomy edit that is not reflected in this repo fails the suite instead of silently
// re-grading a kind on a public surface (and in the generated posture figure).
test('the mirrored safety set matches the upstream frozenset, member for member', () => {
  assert.deepEqual([...SAFETY_RELEVANT_CHANGE_KINDS].sort(), [
    'added-required-param',
    'annotation-flip-to-destructive',
    'constraint-narrowed',
    'deep-schema-undiffable',
    'enum-values-removed',
    'instructions-added',
    'instructions-changed',
    'output-schema-changed',
    'param-mirrored-to-header',
    'prompt-args-changed',
    'removed-param',
    'required-set-expanded',
    'tool-removed',
    'type-changed',
  ]);
});

test('the non-safety surfaced kinds are exactly the two additive ones', () => {
  const benign = [...SURFACE_CHANGE_KINDS].filter((k) => !isSafetyRelevant(k)).sort();
  // added-optional-param is LOW and output-schema-added is ADDITIVE upstream. If either moves,
  // the guard column in the posture figure flips for that row - which is the point of pinning.
  assert.deepEqual(benign, ['added-optional-param', 'output-schema-added']);
});

test('a schema too deep to diff fails SAFE, never silently benign', () => {
  assert.ok(isSafetyRelevant('deep-schema-undiffable'));
});

test('every safety-relevant kind is one the public surface can actually show', () => {
  for (const k of SAFETY_RELEVANT_CHANGE_KINDS) {
    assert.ok(
      SURFACE_CHANGE_KINDS.has(k) || CONTEXT_SURFACE_CHANGE_KINDS.has(k),
      `${k} carries the safety bit but is not surfaced`,
    );
  }
});

// The two posture-input sets, mirrored from corpus_eval/tooling/cse/gate.py and VERIFIED
// 2026-07-27 by driving the real Gate. Pinned for the same reason as the safety set: an
// upstream edit that is not mirrored here would silently re-grade a public surface.
test('the benign auto-accept allowlist matches the gate frozenset', () => {
  assert.deepEqual([...BENIGN_AUTOACCEPT_CHANGE_KINDS].sort(), [
    'added-optional-param',
    'output-schema-added',
    'tool-added',
  ]);
});

test('the behaviour-mandated set matches the gate frozenset', () => {
  assert.deepEqual([...BEHAVIORAL_MANDATED_CHANGE_KINDS].sort(), [
    'annotation-flip-to-destructive',
    'output-schema-changed',
  ]);
});

test('postureOutcome reproduces the observed gate behaviour', () => {
  // Observed by driving the Gate at each posture, not read off the docs.
  assert.equal(postureOutcome('added-optional-param', 'strict'), 'PROCEED');
  assert.equal(postureOutcome('output-schema-added', 'strict'), 'PROCEED');
  assert.equal(postureOutcome('added-required-param', 'guard'), 'HOLD');
  assert.equal(postureOutcome('annotation-flip-to-destructive', 'guard'), 'INCONCLUSIVE');
  assert.equal(postureOutcome('output-schema-changed', 'strict'), 'INCONCLUSIVE');
  assert.equal(postureOutcome('deep-schema-undiffable', 'guard'), 'HOLD');
  for (const k of SURFACE_CHANGE_KINDS) {
    const m = postureOutcome(k, 'monitor');
    assert.ok(m === 'PROCEED' || m === 'PROCEED_NOTIFY', `${k}: monitor must never block`);
  }
});

test('a benign kind never carries the safety bit (the sets cannot overlap)', () => {
  for (const k of BENIGN_AUTOACCEPT_CHANGE_KINDS) {
    assert.ok(!isSafetyRelevant(k), `${k} cannot be both auto-accepted and safety-relevant`);
  }
});
