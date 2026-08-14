// Ties /api/v1/servers and /api/registry-count together, because they publish two different
// numbers for what a reader reasonably assumes is one thing.
//
// THE DEFECT THIS EXISTS FOR: production served `total: 21311` from /api/v1/servers and
// `servers: 21304` from /api/registry-count in the same second. Both were correct — the
// second deliberately counts registry rows ONLY, because it publishes its figure beside the
// claim `source: registry.modelcontextprotocol.io` — and they differ by exactly the
// editorially-admitted set. But nothing in either payload said so, so the only way to learn
// which number answered which question was to read lib/registry.ts. For a product whose
// pitch is checkable numbers, two public endpoints disagreeing with no stated reason is the
// bug, even when both are right.
//
// These tests pin the RELATIONSHIP, not the values: the corpus changes hourly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { GET as servers } from '../../app/api/v1/servers/route';
import { GET as registryCount } from '../../app/api/registry-count/route';

type BySource = { registry: number; admitted: number };
type ServersBody = { total: number; totalBySource: BySource; returned: number };

async function serversBody(query?: Record<string, string>): Promise<ServersBody> {
  const res = await callRoute(servers, '/api/v1/servers', { query });
  assert.equal(res.status, 200);
  return res.json() as ServersBody;
}

test('/api/v1/servers states what its `total` totals', async () => {
  const body = await serversBody({ limit: '1' });
  assert.equal(typeof body.total, 'number');
  assert.ok(body.totalBySource, 'total must be broken down, not published bare');
  assert.equal(typeof body.totalBySource.registry, 'number');
  assert.equal(typeof body.totalBySource.admitted, 'number');
});

test('the parts sum to the whole — a breakdown that does not is worse than none', async () => {
  const { total, totalBySource } = await serversBody({ limit: '1' });
  assert.equal(
    totalBySource.registry + totalBySource.admitted,
    total,
    'totalBySource must account for every server in total',
  );
});

test('the two endpoints reconcile: registry-count === the registry component', async () => {
  // THE ACTUAL RECONCILIATION. If these ever drift apart again, the site is publishing two
  // unexplained numbers and this fails — which is the whole point of the field.
  const { totalBySource } = await serversBody({ limit: '1' });
  const res = await callRoute(registryCount, '/api/registry-count');
  assert.equal(res.status, 200);
  const count = res.json() as { servers: number; source: string };

  assert.equal(
    count.servers,
    totalBySource.registry,
    '/api/registry-count must equal the registry component of /api/v1/servers',
  );
  // And it must keep SAYING it is registry-only — that label is what makes the gap legible.
  assert.match(count.source, /registry\.modelcontextprotocol\.io/);
});

test('`total` still counts the admitted set — the fix is additive, not a redefinition', async () => {
  // Changing `total` to registry-only would silently move a number consumers already read.
  // The gap is closed by EXPLAINING total, never by shrinking it.
  const { total, totalBySource } = await serversBody({ limit: '1' });
  assert.ok(total >= totalBySource.registry, 'total must not drop below the registry count');
});

test('the breakdown honours ?category= so it never contradicts its own total', async () => {
  const filtered = await serversBody({ limit: '1', category: 'database' });
  assert.equal(
    filtered.totalBySource.registry + filtered.totalBySource.admitted,
    filtered.total,
    'a filtered total needs a filtered breakdown',
  );
  const all = await serversBody({ limit: '1' });
  assert.ok(filtered.total <= all.total, 'a category is a subset of the corpus');
});
