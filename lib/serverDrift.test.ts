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

// ---- absence is not zero (2026-08-24) ----
// Three fields of the API said "0 / false / clean" where the honest answer was "we cannot tell".
// Each of these pins one of them, because each was reproducible against the live endpoint.

function cx(over: Partial<ContextEvent>): ContextEvent {
  return {
    server_fp: FP_A,
    sources: 1,
    safety_relevant: false,
    last_seen: '2026-06-10T04:00:00Z',
    change_kinds: ['instructions-changed'],
    ...over,
  };
}

test('known: an unrecognised name is not reported as clean', () => {
  // `?server=test` returned changes:0 / contextChanges:0 - byte-identical to a clean server.
  const unknown = aggregateServerDrift([], FP_A, '', [], false);
  const clean = aggregateServerDrift([], FP_A, '', [], true);
  assert.equal(unknown.changes, 0);
  assert.equal(clean.changes, 0);
  assert.notEqual(unknown.known, clean.known, 'the zeros must be distinguishable');
  assert.equal(unknown.known, false);
});

test('known defaults FALSE, so an unwired caller cannot assert knowledge it lacks', () => {
  assert.equal(aggregateServerDrift([], FP_A, '').known, false);
});

test('contextSafetyRelevant is separate from the tool-only safetyRelevant flag', () => {
  // Live 2026-08-24: ai.mcpanalytics/analytics returned safetyRelevant:false while carrying a
  // safety-relevant instructions-added. Reading the flag next to contextChanges gave a false
  // all-clear on the one surface no tool gate covers.
  const out = aggregateServerDrift(
    [ev({ safety_relevant: false, change_kinds: ['added-optional-param'] })],
    FP_A,
    '',
    [cx({ safety_relevant: true, change_kinds: ['instructions-added'] })],
    true,
  );
  assert.equal(out.safetyRelevant, false, 'tool plane is genuinely quiet');
  assert.equal(out.contextSafetyRelevant, true, 'context plane is not');
});

test('contextSafetyRelevant ignores OTHER servers context events', () => {
  const out = aggregateServerDrift([], FP_A, '', [cx({ server_fp: FP_B, safety_relevant: true })], true);
  assert.equal(out.contextChanges, 0);
  assert.equal(out.contextSafetyRelevant, false);
});

test('versionEvidence: an ungated blob reports unavailable, not three honest-looking zeros', () => {
  // version_delta is emitted only behind a two-key ratification gate. Measured 2026-08-24: absent
  // on all 13,862 live events, so every server returned 0/0/0 with no way to know why.
  const out = aggregateServerDrift([ev({}), ev({ tool_fp: '9'.repeat(32) })], FP_A, '', [], true);
  assert.equal(out.versionEvidence, 'unavailable');
  assert.equal(out.versionSameCount + out.versionChangedCount + out.versionUndeclaredCount, 0);
});

test('versionEvidence is a property of the BLOB, so a clean server still reports recorded', () => {
  // Keyed on this server's own events it would read 'unavailable' for every quiet server even
  // with the frame on, which is the same conflation one level down.
  const out = aggregateServerDrift(
    [ev({ server_fp: FP_B, version_delta: 'changed' })],
    FP_A,
    '',
    [],
    true,
  );
  assert.equal(out.changes, 0, 'this server has no events');
  assert.equal(out.versionEvidence, 'recorded', 'but the frame is emitting');
});

test('versionEvidence: not-recorded is a VALUE, and still counts as the frame being on', () => {
  const out = aggregateServerDrift([ev({ version_delta: 'not-recorded' })], FP_A, '', [], true);
  assert.equal(out.versionEvidence, 'recorded');
  assert.equal(out.versionSameCount + out.versionChangedCount + out.versionUndeclaredCount, 0);
});
