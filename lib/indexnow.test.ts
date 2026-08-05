import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_PRIORITY_URLS,
  INDEXNOW_SITE,
  assertIndexNowKey,
  buildIndexNowPayload,
  filterIndexNowUrls,
  keyLocationFor,
  submitIndexNow,
} from './indexnow';

test('assertIndexNowKey accepts the committed key shape', () => {
  assert.equal(assertIndexNowKey(INDEXNOW_KEY), INDEXNOW_KEY);
  assert.equal(assertIndexNowKey('  abcdef12  '), 'abcdef12');
});

test('assertIndexNowKey rejects short or illegal keys', () => {
  assert.throws(() => assertIndexNowKey('short'), /8–128/);
  assert.throws(() => assertIndexNowKey('bad_key!!'), /8–128/);
});

test('keyLocationFor is root Option-1 URL', () => {
  assert.equal(
    keyLocationFor(INDEXNOW_KEY),
    `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
  );
});

test('filterIndexNowUrls drops off-host and duplicates', () => {
  const urls = filterIndexNowUrls([
    `${INDEXNOW_SITE}/install`,
    `${INDEXNOW_SITE}/install`,
    'https://evil.example/install',
    'http://mcpindex.ai/install',
    'https://mcpindex.ai.evil.com/install',
    'https://mcpindex.ai@evil.com/install',
    'not-a-url',
    `  ${INDEXNOW_SITE}/trust  `,
  ]);
  assert.deepEqual(urls, [`${INDEXNOW_SITE}/install`, `${INDEXNOW_SITE}/trust`]);
});

test('buildIndexNowPayload shapes a valid POST body', () => {
  const payload = buildIndexNowPayload([`${INDEXNOW_SITE}/docs`]);
  assert.equal(payload.host, INDEXNOW_HOST);
  assert.equal(payload.key, INDEXNOW_KEY);
  assert.equal(payload.keyLocation, `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(payload.urlList, [`${INDEXNOW_SITE}/docs`]);
});

test('buildIndexNowPayload throws on empty filtered list', () => {
  assert.throws(() => buildIndexNowPayload(['https://other.example/']), /empty/);
});

test('INDEXNOW_PRIORITY_URLS are all on-host https', () => {
  assert.ok(INDEXNOW_PRIORITY_URLS.length >= 10);
  for (const u of INDEXNOW_PRIORITY_URLS) {
    assert.ok(u.startsWith(INDEXNOW_SITE), u);
  }
});

test('submitIndexNow dryRun returns payload without calling fetch', async () => {
  let called = false;
  const result = await submitIndexNow([`${INDEXNOW_SITE}/`], {
    dryRun: true,
    fetchImpl: async () => {
      called = true;
      return new Response('nope', { status: 500 });
    },
  });
  assert.equal(called, false);
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.submitted, 1);
  assert.match(result.body, /"host": "mcpindex.ai"/);
});

test('submitIndexNow treats 200 and 202 as ok', async () => {
  for (const status of [200, 202]) {
    const result = await submitIndexNow([`${INDEXNOW_SITE}/`], {
      fetchImpl: async () => new Response('', { status }),
    });
    assert.equal(result.ok, true, `status ${status}`);
    assert.equal(result.status, status);
  }
});

test('submitIndexNow treats 403 as not ok', async () => {
  const result = await submitIndexNow([`${INDEXNOW_SITE}/`], {
    fetchImpl: async () => new Response('forbidden', { status: 403 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.body, 'forbidden');
});

test('submitIndexNow returns ok:false on fetch rejection (fail-open)', async () => {
  const result = await submitIndexNow([`${INDEXNOW_SITE}/`], {
    fetchImpl: async () => {
      throw new Error('network down');
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.match(result.body, /network down/);
});
