import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVersionedBodyCache } from './llmsFullCache';

test('resolve: builds once per version, reuses on same version (no rebuild)', async () => {
  const store = createVersionedBodyCache();
  let builds = 0;
  const build = async () => { builds++; return `body-${builds}`; };

  const a = await store.resolve('v1', build);
  assert.equal(a.body, 'body-1');
  const b = await store.resolve('v1', build);
  assert.equal(b, a, 'same version must return the cached object');
  assert.equal(builds, 1, 'same version must not rebuild');
});

test('resolve: rebuilds on version turnover (daily snapshot rollover)', async () => {
  const store = createVersionedBodyCache();
  let builds = 0;
  const build = async () => { builds++; return `body-${builds}`; };

  const v1 = await store.resolve('v1', build);
  const v2 = await store.resolve('v2', build);
  assert.equal(v1.body, 'body-1');
  assert.equal(v2.body, 'body-2');
  assert.equal(v2.version, 'v2');
  assert.equal(builds, 2, 'version turnover must rebuild');
});

test('resolve: two concurrent misses share ONE build (no double 4MB serialize)', async () => {
  const store = createVersionedBodyCache();
  let builds = 0;
  const build = async () => {
    builds++;
    // The dedup holds purely from synchronous `inflight` assignment + Promise.all's left-to-right
    // start order; this await just makes the in-flight overlap explicit/realistic.
    await new Promise((r) => setTimeout(r, 10));
    return `body-${builds}`;
  };

  const [a, b] = await Promise.all([store.resolve('v1', build), store.resolve('v1', build)]);
  assert.equal(builds, 1, 'concurrent misses must de-dupe to a single build');
  assert.equal(a.body, b.body);
  assert.equal(a, b);
});

test('resolve: concurrent DIFFERENT-version miss stays internally consistent, then self-corrects', async () => {
  // A v2 request arriving while a v1 build is in-flight shares the v1 build (single-inflight dedup).
  // The guarantee that matters: the object it receives is INTERNALLY consistent (its .version labels
  // its own .body) — never a v2 label on a v1 body. A future refactor that tagged the result with the
  // *requested* version instead of the *built* one would make the route's X-Snapshot-Version header
  // lie about the body served; this test locks against that.
  const store = createVersionedBodyCache();
  let builds = 0;
  const versionsBuilt: string[] = [];
  const build = async (v: string) => {
    builds++;
    versionsBuilt.push(v);
    await new Promise((r) => setTimeout(r, 10));
    return `body-${v}`;
  };

  const [a, b] = await Promise.all([
    store.resolve('v1', () => build('v1')),
    store.resolve('v2', () => build('v2')),
  ]);
  assert.equal(builds, 1, 'the v2 caller must share the in-flight v1 build, not start a second');
  // Both callers get the same v1 object, and it is self-consistent (version matches its body):
  assert.equal(a, b);
  assert.equal(a.version, 'v1');
  assert.equal(a.body, 'body-v1');

  // Self-correction: a subsequent v2 resolve now rebuilds (cache holds v1, inflight cleared).
  const c = await store.resolve('v2', () => build('v2'));
  assert.equal(c.version, 'v2');
  assert.equal(c.body, 'body-v2');
  assert.equal(builds, 2);
});

test('resolve: a build throw rejects waiters and self-heals (no permanent poison)', async () => {
  const store = createVersionedBodyCache();
  let attempts = 0;
  const flaky = async () => {
    attempts++;
    if (attempts === 1) throw new Error('build failed');
    return 'ok';
  };

  await assert.rejects(store.resolve('v1', flaky), /build failed/);
  // inflight must be cleared so the next call retries rather than returning a poisoned promise.
  const recovered = await store.resolve('v1', flaky);
  assert.equal(recovered.body, 'ok');
  assert.equal(attempts, 2);
});
