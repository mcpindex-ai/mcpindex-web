import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigest } from './driftDigest';
import type { LedgerEvent } from './ledger';

const ev = (change_kinds: string[]): LedgerEvent => ({
  tool_fp: 'x', server_fp: 'y', sources: 1, safety_relevant: false, last_seen: '', change_kinds,
});

test('buildDigest aggregates ChangeKinds into priority-ordered standouts + benign count', () => {
  const d = buildDigest([
    ev(['added-optional-param']),
    ev(['added-optional-param', 'added-required-param']),
    ev(['annotation-flip-to-destructive']),
    ev(['annotation-flip-to-destructive']),
    ev(['output-schema-changed']),
    ev(['removed-param']),
  ]);
  assert.equal(d.benign, 2); // two added-optional-param
  assert.equal(d.standouts[0].kind, 'annotation-flip-to-destructive'); // most-alarming first
  assert.equal(d.standouts[0].count, 2);
  assert.equal(d.standouts.find((s) => s.kind === 'added-required-param')?.count, 1);
  assert.ok(d.standouts.every((s) => s.count > 0)); // no zero-count entries rendered
  assert.ok(d.standouts.every((s) => s.label.length > 0)); // every kind has plain-English copy
});

test('buildDigest is total on empty input', () => {
  const d = buildDigest([]);
  assert.equal(d.benign, 0);
  assert.equal(d.standouts.length, 0);
});

test('buildDigest ignores kinds with no plain-English copy (renders nothing raw)', () => {
  const d = buildDigest([ev(['some-future-kind-we-have-no-copy-for'])]);
  assert.equal(d.standouts.length, 0); // never surfaces a raw ChangeKind token
});
