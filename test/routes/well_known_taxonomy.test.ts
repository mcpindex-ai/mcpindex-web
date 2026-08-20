// The published detector taxonomy in /.well-known/mcp-index.json is a machine-readable claim
// about what the in-path gate detects. It is meant to be a strict SUPERSET of the surfaced
// subset in lib/changeKinds.ts, but nothing enforced that: by 2026-08-20 it had lapsed, missing
// added-optional-param and deep-schema-undiffable. The second of those is in the gate's own
// _GUARD_DANGEROUS_KINDS, so the published contract was hiding a HOLD cause from anyone reading
// it to decide whether to install. These tests pin the relationship in both directions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { GET as wellKnown } from '../../app/.well-known/mcp-index.json/route';
import { SURFACE_CHANGE_KINDS, CONTEXT_SURFACE_CHANGE_KINDS } from '../../lib/changeKinds';

async function publishedKinds(): Promise<string[]> {
  const r = await callRoute(wellKnown, '/.well-known/mcp-index.json');
  assert.equal(r.status, 200);
  const body = r.json() as Record<string, any>;
  const kinds = body?.drift_gate?.change_kinds;
  assert.ok(Array.isArray(kinds) && kinds.length > 0, 'drift_gate.change_kinds must be a non-empty array');
  return kinds as string[];
}

test('well-known taxonomy contains every surfaced ChangeKind (superset invariant)', async () => {
  const published = await publishedKinds();
  const missing = [...SURFACE_CHANGE_KINDS].filter((k) => !published.includes(k)).sort();
  assert.deepEqual(
    missing,
    [],
    `published taxonomy omits surfaced kind(s): ${missing.join(', ')}. A kind the drain ` +
      'surfaces publicly but /.well-known does not declare understates what the gate detects.',
  );
});

test('well-known taxonomy declares deep-schema-undiffable, which GUARD blocks on', async () => {
  // Singled out because it is the one omission that changed the meaning of the document
  // rather than just its completeness: it is a blocking kind in the gate's dangerous set.
  assert.ok((await publishedKinds()).includes('deep-schema-undiffable'));
});

test('well-known taxonomy stays tool-scoped: no context-surface kinds, no duplicates', async () => {
  const published = await publishedKinds();
  // Server-scoped context kinds are NOT gate-detected (the gate pins tool contracts; the
  // sweep observes context surfaces), so publishing them here would fabricate a gate claim.
  const leaked = published.filter((k) => CONTEXT_SURFACE_CHANGE_KINDS.has(k));
  assert.deepEqual(leaked, [], `context-surface kinds must not appear in the gate taxonomy: ${leaked.join(', ')}`);
  assert.equal(new Set(published).size, published.length, 'duplicate entries in change_kinds');
  // Prose kinds belong to the marker scan, not the contract differ (see the route comment).
  assert.ok(!published.includes('description-only'));
  assert.ok(!published.includes('description-numeric'));
});
