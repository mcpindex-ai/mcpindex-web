import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND_LABEL, kindLabel } from './kindLabels';
import { SURFACE_CHANGE_KINDS } from './changeKinds';

test('KIND_LABEL covers SURFACE_CHANGE_KINDS member-for-member (no unlabeled or orphan kinds)', () => {
  // A new taxonomy member without a label would ship a raw token to users; a label for a removed
  // member is dead weight. Enforce exact set equality so either drift fails here.
  assert.deepEqual(Object.keys(KIND_LABEL).sort(), [...SURFACE_CHANGE_KINDS].sort());
});

test('kindLabel humanizes unknown codes instead of hiding them', () => {
  assert.equal(kindLabel('some-future-kind'), 'some future kind');
  assert.equal(kindLabel('added-required-param'), 'new required input');
});
