// The render path must resolve the registry snapshot from data/snapshot.json and NOTHING
// else - no Redis, no network of any kind.
//
// This exists because the rule was previously enforced only by a comment. A KV read on this
// path re-breaks static generation: @upstash/redis defaults its fetch to `cache: "no-store"`,
// every page reaching resolveSnapshot() is ISR, and a no-store fetch during static generation
// makes Next abort the render with `Page changed from static to dynamic at runtime`, which
// surfaces as a 500 on cold instances - i.e. exactly the path a crawler hits most.
//
// Disabling global fetch is the same technique v1_dispatch.test.ts uses to prove in-process
// dispatch. Any reintroduced network read fails here instead of in production.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadServers, loadSnapshotMeta, readBundledSnapshot } from '../../lib/registry';

/** Runs `fn` with global fetch replaced by a throwing stub. */
async function withFetchDisabled<T>(fn: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    throw new Error('network read on the snapshot resolve path');
  }) as typeof fetch;
  try {
    const out = await fn();
    assert.equal(called, false, 'resolve path must not call fetch');
    return out;
  } finally {
    globalThis.fetch = real;
  }
}

test('loadSnapshotMeta resolves with global fetch disabled (no KV read)', async () => {
  const meta = await withFetchDisabled(() => loadSnapshotMeta());
  assert.ok(meta.version.length > 0, 'a version must resolve from the bundled file');
  assert.ok(meta.fetchedAt.length > 0);
});

test('loadServers resolves with global fetch disabled (no KV read)', async () => {
  const servers = await withFetchDisabled(() => loadServers());
  assert.ok(servers.length > 1000, `expected the real corpus, got ${servers.length}`);
});

test('readBundledSnapshot is the source: its version matches what the render path serves', async () => {
  const [bundled, meta] = await Promise.all([readBundledSnapshot(), loadSnapshotMeta()]);
  // If a network cache were preferred again, these would diverge - which is precisely the
  // sitemap-advertises-a-slug-whose-page-404s failure mode.
  assert.equal(meta.version, bundled.snapshot_version);
});

test('lib/snapshotStore exports no KV surface (the write side is gone too)', async () => {
  const mod: Record<string, unknown> = await import('../../lib/snapshotStore');
  for (const banned of ['readKVSnapshot', 'writeKVSnapshot', 'kvConfigured']) {
    assert.equal(mod[banned], undefined, `${banned} must stay deleted, not merely unused`);
  }
  assert.equal(typeof mod.snapshotVersion, 'function', 'snapshotVersion is the module contract');
});
