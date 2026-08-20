import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateServerDrift } from './serverDrift';
import type { ContextEvent, LedgerEvent } from './ledger';

const FP_A = 'a'.repeat(32);
const FP_B = 'b'.repeat(32);

function ev(over: Partial<LedgerEvent>): LedgerEvent {
  return {
    tool_fp: '0'.repeat(32),
    server_fp: FP_A,
    sources: 1,
    safety_relevant: false,
    last_seen: '2026-06-10T04:00:00Z',
    change_kinds: [],
    ...over,
  };
}

test('aggregates only this server, unions+sorts kinds, takes the latest last_seen', () => {
  const events: LedgerEvent[] = [
    ev({ tool_fp: '1'.repeat(32), change_kinds: ['type-changed'], last_seen: '2026-06-10T04:00:00Z' }),
    ev({ tool_fp: '2'.repeat(32), change_kinds: ['added-required-param', 'type-changed'], last_seen: '2026-06-10T06:00:00Z', safety_relevant: true }),
    ev({ tool_fp: '3'.repeat(32), server_fp: FP_B, change_kinds: ['removed-param'] }), // other server -> excluded
  ];
  const out = aggregateServerDrift(events, FP_A, '2026-06-10T07:00:00Z');
  assert.equal(out.changes, 2);
  assert.deepEqual(out.kinds, ['added-required-param', 'type-changed']);
  assert.equal(out.lastSeen, '2026-06-10T06:00:00Z');
  assert.equal(out.safetyRelevant, true);
  assert.equal(out.ledgerGeneratedAt, '2026-06-10T07:00:00Z');
});

test('a server with no matching events returns changes:0 (honest none, not null)', () => {
  const out = aggregateServerDrift([ev({ server_fp: FP_B })], FP_A, '2026-06-10T07:00:00Z');
  assert.equal(out.changes, 0);
  assert.equal(out.lastSeen, null);
  assert.deepEqual(out.kinds, []);
  assert.equal(out.safetyRelevant, false);
});

test('aggregateServerDrift: toolsetReplaced true only when a matched removal event carries the scope', () => {
  const fp = 'a'.repeat(32);
  const ev = (over: Record<string, unknown>) => ({
    tool_fp: 'b'.repeat(32), server_fp: fp, sources: 1, safety_relevant: true,
    last_seen: '2026-07-19T00:00:00Z', change_kinds: ['tool-removed'], ...over,
  });
  const withScope = aggregateServerDrift(
    [ev({ removal_scope: 'toolset-replaced' }) as never], fp, '2026-07-19T00:00:00Z');
  assert.equal(withScope.toolsetReplaced, true);
  const single = aggregateServerDrift([ev({ removal_scope: 'single' }) as never], fp, '');
  assert.equal(single.toolsetReplaced, false);
  const none = aggregateServerDrift([ev({}) as never], fp, '');
  assert.equal(none.toolsetReplaced, false);
  const otherServer = aggregateServerDrift(
    [ev({ server_fp: 'c'.repeat(32), removal_scope: 'toolset-replaced' }) as never], fp, '');
  assert.equal(otherServer.toolsetReplaced, false);
});

test('aggregateServerDrift version counts: reduced classes counted; not-recorded contributes nothing', () => {
  const fp = 'a'.repeat(32);
  const ev = (vd?: string) => ({
    tool_fp: 'b'.repeat(32), server_fp: fp, sources: 1, safety_relevant: false,
    last_seen: '2026-07-19T00:00:00Z', change_kinds: ['type-changed'],
    ...(vd ? { version_delta: vd } : {}),
  });
  const out = aggregateServerDrift(
    [ev('same'), ev('same'), ev('changed'), ev('undeclared'), ev('not-recorded'), ev()] as never[],
    fp, '2026-07-19T00:00:00Z');
  assert.equal(out.versionSameCount, 2);
  assert.equal(out.versionChangedCount, 1);
  assert.equal(out.versionUndeclaredCount, 1);
});

// ---- server-scoped context events ----

function cev(over: Partial<ContextEvent>): ContextEvent {
  return {
    server_fp: FP_A,
    sources: 1,
    safety_relevant: true,
    last_seen: '2026-08-19T05:00:00Z',
    change_kinds: ['instructions-changed'],
    ...over,
  };
}

test('context events aggregate apart from tool events and never inflate `changes`', () => {
  const events: LedgerEvent[] = [ev({ change_kinds: ['type-changed'] })];
  const ctx: ContextEvent[] = [
    cev({}),
    cev({ change_kinds: ['prompt-args-changed'], last_seen: '2026-08-19T07:00:00Z' }),
    cev({ server_fp: FP_B }), // other server -> excluded
  ];
  const out = aggregateServerDrift(events, FP_A, '2026-08-19T08:00:00Z', ctx);
  assert.equal(out.changes, 1); // tool count untouched by context rows
  assert.equal(out.contextChanges, 2);
  assert.deepEqual(out.contextKinds, ['instructions-changed', 'prompt-args-changed']);
  assert.equal(out.contextLastSeen, '2026-08-19T07:00:00Z');
  // Context safety stays out of the tool badge (the context block carries its own framing).
  assert.equal(out.safetyRelevant, false);
});

test('context defaults: absent array (old blob / old caller) means zero, not undefined', () => {
  const out = aggregateServerDrift([ev({})], FP_A, '2026-08-19T08:00:00Z');
  assert.equal(out.contextChanges, 0);
  assert.deepEqual(out.contextKinds, []);
  assert.equal(out.contextLastSeen, null);
});

test('context-only drift: changes 0 with contextChanges > 0 (the zero-state must branch on both)', () => {
  const out = aggregateServerDrift([], FP_A, '2026-08-19T08:00:00Z', [cev({})]);
  assert.equal(out.changes, 0);
  assert.equal(out.contextChanges, 1);
});
