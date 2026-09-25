import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateServerDrift as aggregateOrNull } from './serverDrift';

// Every case in this file expects an answer; the one that expects null calls aggregateOrNull.
function aggregateServerDrift(...args: Parameters<typeof aggregateOrNull>) {
  const out = aggregateOrNull(...args);
  assert.ok(out, 'expected an answer, got null');
  return out;
}
import type { ContextEvent, FleetEvent, LedgerEvent } from './ledger';

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

// ---- ledger /3: a member server's answer must equal its /2 answer ----
//
// One corpus, written twice: as the /2 blob the drain publishes today (one event per tool, kinds
// and last_seen over the tool's whole history) and as the /3 blob it publishes with fleets on.
// The fixture carries the cases that break a naive fold: a tool that changed on its own AND
// inside a fleet (t2), a server in three fleet events, a toolset replacement that only exists
// inside a fleet (t6), version evidence on fleet-only tools, and context members with and
// without an independent context event.
const FP_C = 'c'.repeat(32);
const PUB = 'd'.repeat(32);
const t = (n: number) => String(n).repeat(32).slice(0, 32);
const H = (d: string) => `${d}T04:00:00Z`;

const V2_EVENTS: LedgerEvent[] = [
  ev({ tool_fp: t(1), change_kinds: ['type-changed'], last_seen: H('2026-06-01'), version_delta: 'not-recorded' }),
  ev({ tool_fp: t(2), change_kinds: ['added-optional-param', 'type-changed'], last_seen: H('2026-09-24'), version_delta: 'same' }),
  ev({ tool_fp: t(3), change_kinds: ['added-optional-param'], last_seen: H('2026-09-24'), version_delta: 'same' }),
  ev({ tool_fp: t(4), change_kinds: ['added-optional-param'], last_seen: H('2026-09-24'), version_delta: 'changed' }),
  ev({ tool_fp: t(5), change_kinds: ['output-schema-added'], last_seen: H('2026-09-10'), version_delta: 'undeclared' }),
  ev({ tool_fp: t(6), change_kinds: ['tool-removed'], last_seen: H('2026-09-24'), version_delta: 'same', safety_relevant: true, removal_scope: 'toolset-replaced' }),
  ev({ tool_fp: t(7), server_fp: FP_C, change_kinds: ['removed-param'], last_seen: H('2026-08-01'), version_delta: 'changed', safety_relevant: true }),
];
const V2_CTX: ContextEvent[] = [
  { server_fp: FP_A, sources: 1, safety_relevant: true, last_seen: H('2026-09-18'), change_kinds: ['instructions-changed'] },
  { server_fp: FP_B, sources: 1, safety_relevant: true, last_seen: H('2026-09-18'), change_kinds: ['instructions-added', 'instructions-changed'] },
];

// /3: t1, t2 and t7 changed on their own. t2's event keeps only its own rows' kinds and
// last_seen, but its full-history version_delta. t3..t6 are fleet-only.
const V3_EVENTS: LedgerEvent[] = [
  V2_EVENTS[0],
  ev({ tool_fp: t(2), change_kinds: ['type-changed'], last_seen: H('2026-06-02'), version_delta: 'same' }),
  V2_EVENTS[6],
];
const V3_CTX: ContextEvent[] = [
  { server_fp: FP_B, sources: 1, safety_relevant: true, last_seen: H('2026-09-02'), change_kinds: ['instructions-added'] },
];
const fleet = (over: Partial<FleetEvent>): FleetEvent => ({
  plane: 'tool',
  publisher_fp: PUB,
  day: '2026-09-24',
  change_kinds: ['added-optional-param'],
  safety_relevant: false,
  servers: 12,
  tools: 40,
  members: [],
  ...over,
});
const m = (over: Partial<FleetEvent['members'][number]>) => ({
  server_fp: FP_A,
  page_tools: 0,
  last_seen: H('2026-09-24'),
  safety_relevant: false,
  toolset_replaced: false,
  ...over,
});
const V3_FLEETS: FleetEvent[] = [
  // t3, t4 (and t2, which is already an independent event, so not in page_tools).
  fleet({ members: [m({ page_tools: 2, version_same: 1, version_changed: 1, version_undeclared: 0 })] }),
  fleet({ day: '2026-09-10', change_kinds: ['output-schema-added'], members: [m({ page_tools: 1, last_seen: H('2026-09-10'), version_same: 0, version_changed: 0, version_undeclared: 1 })] }),
  fleet({ change_kinds: ['tool-removed'], safety_relevant: true, members: [m({ page_tools: 1, safety_relevant: true, toolset_replaced: true, version_same: 1, version_changed: 0, version_undeclared: 0 })] }),
  fleet({
    plane: 'context',
    day: '2026-09-18',
    change_kinds: ['instructions-changed'],
    safety_relevant: true,
    servers: 60,
    tools: 60,
    members: [
      m({ last_seen: H('2026-09-18'), safety_relevant: true }),
      m({ server_fp: FP_B, last_seen: H('2026-09-18'), safety_relevant: true }),
    ],
  }),
];

// The /3-only fields are the only permitted difference from a /2 answer.
const withoutPublisherWide = (d: ReturnType<typeof aggregateServerDrift>) =>
  Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'publisherWide' && k !== 'publisherWideMore'));

test('/3 identity: every server answers exactly as under /2 for the same corpus', () => {
  for (const fp of [FP_A, FP_B, FP_C, 'e'.repeat(32)]) {
    const v2 = aggregateServerDrift(V2_EVENTS, fp, 'gen', V2_CTX, true);
    const v3 = aggregateServerDrift(V3_EVENTS, fp, 'gen', V3_CTX, true, V3_FLEETS);
    assert.deepEqual(withoutPublisherWide(v3), v2, `server ${fp.slice(0, 4)}`);
  }
  const a = aggregateServerDrift(V3_EVENTS, FP_A, 'gen', V3_CTX, true, V3_FLEETS);
  assert.equal(a.changes, 6, 't1..t6, t2 counted once');
  assert.equal(a.toolsetReplaced, true, 'the removal label survives a fleet-only removal');
  assert.equal(a.contextChanges, 1, 'one surface, even with no independent context event');
});

test('/3: publisherWide lists a member server\'s fleets and is absent for everyone else', () => {
  const a = aggregateServerDrift(V3_EVENTS, FP_A, 'gen', V3_CTX, true, V3_FLEETS);
  assert.equal(a.publisherWide?.length, 4);
  assert.deepEqual(
    a.publisherWide?.map((w) => [w.plane, w.day]),
    // Newest first; the two 2026-09-24 tool fleets differ in kinds, so they stay two lines.
    [['tool', '2026-09-24'], ['tool', '2026-09-24'], ['context', '2026-09-18'], ['tool', '2026-09-10']],
  );
  const c = aggregateServerDrift(V3_EVENTS, FP_C, 'gen', V3_CTX, true, V3_FLEETS);
  assert.equal('publisherWide' in c, false);
});

test('/2 callers: no fleet argument leaves the answer, and its keys, exactly as before', () => {
  const out = aggregateServerDrift(V2_EVENTS, FP_A, 'gen', V2_CTX, true);
  assert.equal('publisherWide' in out, false);
});

test('versionEvidence: a /3 blob whose evidence lives only on fleet members still reads recorded', () => {
  const quiet = [ev({ tool_fp: t(1) })];
  const withMemberEvidence = [fleet({ members: [m({ page_tools: 1, version_same: 1, version_changed: 0, version_undeclared: 0 })] })];
  assert.equal(aggregateServerDrift(quiet, FP_C, '', [], true, withMemberEvidence).versionEvidence, 'recorded');
  assert.equal(aggregateServerDrift(quiet, FP_C, '', [], true, [fleet({ members: [m({ page_tools: 1 })] })]).versionEvidence, 'unavailable');
});

test('/3 contradiction: a fleet member with no tools anywhere is unavailable, never changes:0', () => {
  const lonely = [fleet({ members: [m({ page_tools: 0 })] })];
  assert.equal(aggregateOrNull([], FP_A, 'gen', [], true, lonely), null);
  // page_tools 0 is legitimate when the server's tools are all independent events.
  assert.equal(aggregateServerDrift(V3_EVENTS, FP_A, 'gen', [], true, lonely).changes, 2);
});

test('publisherWide collapses repeats and is bounded, with a count of the rest', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    fleet({ day: `2026-08-${String(i + 1).padStart(2, '0')}`, members: [m({ page_tools: 1 })] }),
  );
  const dupes = [fleet({ members: [m({ page_tools: 1 })] }), fleet({ servers: 40, members: [m({ page_tools: 1 })] })];
  const a = aggregateServerDrift([], FP_A, 'gen', [], true, many);
  assert.equal(a.publisherWide?.length, 10);
  assert.equal(a.publisherWideMore, 15);
  assert.equal(a.publisherWide?.[0].day, '2026-08-25', 'newest first');
  const b = aggregateServerDrift([], FP_A, 'gen', [], true, dupes);
  assert.equal(b.publisherWide?.length, 1, 'same plane, day and kinds is one line');
  assert.equal(b.publisherWide?.[0].servers, 40);
  assert.equal('publisherWideMore' in b, false);
});

