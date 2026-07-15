// Unit tests for the defensive change-kind coercion (read side, M3/M4). The Upstash blob/meta is
// operator/attacker-controllable, so coerceChangeKinds is the gate that keeps the public page/API
// to a fixed allowlist. Run with `npx tsx --test lib/changeKinds.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceChangeKinds, SURFACE_CHANGE_KINDS, MAX_CHANGE_KINDS } from './changeKinds';

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
    'removed-param',
    'required-set-expanded',
    'tool-removed',
    'type-changed',
  ]);
  assert.ok(!SURFACE_CHANGE_KINDS.has('description-only')); // never surfaced (cosmetic churn)
  assert.ok(!SURFACE_CHANGE_KINDS.has('tool-added')); // not drift of an existing dependency
});
