import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { metricsReaderAuthorized, READER_TOKEN_SHA256 } from './metricsReader';

const TOKEN = 'test-reader-token-0123456789abcdef';
const HASH = createHash('sha256').update(TOKEN, 'utf8').digest('hex');

test('the reader token is accepted only as an exact bearer token', () => {
  assert.equal(metricsReaderAuthorized(`Bearer ${TOKEN}`, HASH), true);
  for (const h of [null, '', TOKEN, `bearer ${TOKEN}`, `Bearer ${TOKEN}x`, `Bearer  ${TOKEN}`,
    `Bearer ${TOKEN}, Bearer ${TOKEN}`, `Bearer ${HASH}`, 'Bearer ']) {
    assert.equal(metricsReaderAuthorized(h, HASH), false, String(h));
  }
});

test('the committed value is a sha256 hex digest, so the token itself is not in the repo', () => {
  assert.match(READER_TOKEN_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(metricsReaderAuthorized(`Bearer ${READER_TOKEN_SHA256}`), false);
});
