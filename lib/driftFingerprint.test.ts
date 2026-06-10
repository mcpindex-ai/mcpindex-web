import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverFp } from './driftFingerprint';

// Known vectors computed from the SAME public salt the crawl uses; these are real server_fps present
// in the live ledger (parity verified 17/17 against production). If serverFp ever drifts from the
// crawl, this fails and the per-server drift section would silently match nothing.
test('serverFp matches the crawl fingerprint for known live-ledger vectors', () => {
  assert.equal(serverFp('com.spocont/ifrCoworker'), 'a94e20f7bd1f448a7c455df357356e34');
  assert.equal(serverFp('ac.inference.sh/mcp'), '37a35a60763fcbe0ea8c3b7dbdd57e42');
});

test('serverFp output shape is 32 lowercase hex', () => {
  assert.match(serverFp('anything'), /^[0-9a-f]{32}$/);
  assert.equal(serverFp('').length, 32);
});
