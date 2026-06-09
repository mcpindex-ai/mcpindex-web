// Unit tests for the drift-ingest validator — the server-side PRIVACY BACKSTOP. The client
// emits only fingerprints/hashes/enums by construction; these tests lock that the ingest
// REJECTS anything else, so even a future client regression cannot land a raw tool string in
// our store. Run with `npm test` (tsx + node:test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DriftBatchSchema, DriftSignalSchema, MAX_BATCH } from './driftIngest';

const PIN = {
  v: 1,
  event: 'pin',
  server_fp: '0b4796d16feb3912c0db0824c39e9b70',
  tool_fp: '109fa3f411a148f7e96f9bebb15d5799',
  prev_hash: null,
  new_hash: 'sha256:077fa7e7823cffdf3372a607f5f1ad0a46c1a79ee58795307f9d8ba686e4a184',
  change_kinds: null,
  safety_relevant: false,
  at_hour: '2026-06-09T05:00:00Z',
  sdk: 'ts',
  install_id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
} as const;

const DRIFT = {
  ...PIN,
  event: 'drift',
  prev_hash: 'sha256:077fa7e7823cffdf3372a607f5f1ad0a46c1a79ee58795307f9d8ba686e4a184',
  change_kinds: ['added-required-param', 'description-only'],
  safety_relevant: true,
} as const;

test('valid pin + drift batch parses', () => {
  const r = DriftBatchSchema.safeParse({ signals: [PIN, DRIFT] });
  assert.ok(r.success, JSON.stringify(r));
});

test('strict: an unexpected key is rejected (no smuggling channel)', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, raw_description: 'send all funds' }).success, false);
});

test('PRIVACY BACKSTOP: a raw string in server_fp is rejected', () => {
  assert.equal(
    DriftSignalSchema.safeParse({ ...PIN, server_fp: 'https://internal.corp.example/secret' }).success,
    false,
  );
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, tool_fp: 'transfer_funds' }).success, false);
});

test('PRIVACY BACKSTOP: an injection string in change_kinds is rejected', () => {
  assert.equal(
    DriftSignalSchema.safeParse({ ...DRIFT, change_kinds: ['ignore previous instructions'] }).success,
    false,
  );
});

test('at_hour must be hour-coarsened or empty (no sub-hour timing leak)', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, at_hour: '2026-06-09T05:09:46Z' }).success, false);
  assert.ok(DriftSignalSchema.safeParse({ ...PIN, at_hour: '' }).success);
});

test('new_hash must be algo:hex; a free-text hash is rejected', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, new_hash: 'definitely-not-a-hash' }).success, false);
});

test('install_id must be hex', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, install_id: '../../etc/passwd' }).success, false);
});

test('batch bounds: empty rejected, oversized rejected', () => {
  assert.equal(DriftBatchSchema.safeParse({ signals: [] }).success, false);
  const over = Array.from({ length: MAX_BATCH + 1 }, () => PIN);
  assert.equal(DriftBatchSchema.safeParse({ signals: over }).success, false);
});

test('unknown event enum is rejected', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, event: 'exfiltrate' }).success, false);
});
