import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEDGER_SCHEMA, LEDGER_SCHEMA_V3, parseLedgerBlob, type Ledger } from './ledger';
import {
  EMPTY_SLICE,
  LEDGER_SERVER_SCHEMA,
  LEDGER_SUMMARY_SCHEMA,
  SUMMARY_MAX_AGE_MS,
  parseLedgerSummary,
  parseServerSlice,
  viewOfFullLedger,
} from './ledgerSplit';
import { aggregateServerDrift } from './serverDrift';
import { buildDigest, digestFromCounts } from './driftDigest';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const PUB = 'd'.repeat(32);
const AT = '2026-10-13T04:00:00Z';
const NOW = Date.parse(AT);

// A /3 blob shaped like the drain's, and the split the drain builds from it
// (scripts/drift_corpus_drain.py build_ledger_split): each server's rows, a fleet event once per
// member carrying only that member, and a summary of the head rows plus counts.
const FULL = {
  schema: LEDGER_SCHEMA_V3,
  generated_at: AT,
  framing: 'observed',
  stat: { tools_observed_drifting: 3, total_contract_drifts_observed: 9, servers: 2, safety_relevant: 1 },
  events: [
    { tool_fp: '1'.repeat(32), server_fp: A, sources: 1, safety_relevant: true, last_seen: '2026-10-13T03:00:00Z', change_kinds: ['added-required-param'], version_delta: 'same' },
    { tool_fp: '2'.repeat(32), server_fp: B, sources: 1, safety_relevant: false, last_seen: '2026-10-12T03:00:00Z', change_kinds: ['type-changed'], removal_scope: 'single' },
    { tool_fp: '3'.repeat(32), server_fp: A, sources: 1, safety_relevant: false, last_seen: '2026-10-11T03:00:00Z', change_kinds: ['added-optional-param'] },
  ],
  context_events: [
    { server_fp: B, sources: 1, safety_relevant: true, last_seen: '2026-10-12T03:00:00Z', change_kinds: ['instructions-changed'] },
  ],
  fleet_events: [
    {
      plane: 'tool', publisher_fp: PUB, day: '2026-10-10', change_kinds: ['removed-param'],
      safety_relevant: true, servers: 12, tools: 40, tool_fps: ['4'.repeat(32)],
      members: [
        { server_fp: A, page_tools: 2, last_seen: '2026-10-10T05:00:00Z', safety_relevant: true, toolset_replaced: true, version_same: 1 },
        { server_fp: C, page_tools: 3, last_seen: '2026-10-10T05:00:00Z', safety_relevant: false, toolset_replaced: false, version_changed: 2 },
      ],
    },
    {
      plane: 'context', publisher_fp: PUB, day: '2026-10-09', change_kinds: ['instructions-changed'],
      safety_relevant: false, servers: 10, tools: 10,
      members: [{ server_fp: C, page_tools: 0, last_seen: '2026-10-09T05:00:00Z', safety_relevant: false, toolset_replaced: false }],
    },
  ],
};

type Raw = Record<string, unknown>;
const head = (f: Raw): Raw => Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'members' && k !== 'tool_fps'));

function sliceFor(fp: string): Raw {
  return {
    schema: LEDGER_SERVER_SCHEMA,
    events: FULL.events.filter((e) => e.server_fp === fp),
    context_events: FULL.context_events.filter((e) => e.server_fp === fp),
    fleet_events: FULL.fleet_events.flatMap((f) =>
      f.members.filter((m) => m.server_fp === fp).map((m) => ({ ...head(f), members: [m] })),
    ),
  };
}

function summaryOf(over: Raw = {}, rows = 300): Raw {
  return {
    schema: LEDGER_SUMMARY_SCHEMA,
    ledger_schema: FULL.schema,
    generated_at: FULL.generated_at,
    framing: FULL.framing,
    stat: FULL.stat,
    events: FULL.events.slice(0, rows),
    context_events: FULL.context_events.slice(0, rows),
    fleet_events: FULL.fleet_events.map(head),
    kind_counts: { 'added-optional-param': 1, 'added-required-param': 1, 'type-changed': 1 },
    version_evidence: true,
    counts: { events: 3, context_events: 1, fleet_events: 2, servers: 3 },
    ...over,
  };
}

const full = parseLedgerBlob(FULL) as Ledger;

test('every server answer from its slice equals the answer from the full blob', () => {
  assert.ok(full);
  const summary = parseLedgerSummary(summaryOf(), NOW);
  assert.ok(summary);
  for (const fp of [A, B, C, 'e'.repeat(32)]) {
    for (const known of [true, false]) {
      const want = aggregateServerDrift(full.events, fp, full.generated_at, full.context_events, known, full.fleet_events ?? []);
      const raw = [A, B, C].includes(fp) ? sliceFor(fp) : null;
      const slice = raw === null ? EMPTY_SLICE : parseServerSlice(JSON.stringify(raw), fp);
      assert.ok(slice, `slice for ${fp.slice(0, 4)}`);
      const got = aggregateServerDrift(slice.events, fp, summary.ledger.generated_at, slice.context_events, known, slice.fleet_events);
      // The loader overrides versionEvidence from the summary: it is a property of the blob.
      assert.deepEqual(got && { ...got, versionEvidence: summary.versionEvidence ? 'recorded' : 'unavailable' }, want, fp);
    }
  }
});

test('the summary view matches what the pages read from the full blob', () => {
  const s = parseLedgerSummary(summaryOf(), NOW);
  assert.ok(s);
  const f = viewOfFullLedger(full);
  assert.equal(s.eventsTotal, f.eventsTotal);
  assert.equal(s.contextEventsTotal, f.contextEventsTotal);
  assert.deepEqual(s.ledger.stat, f.ledger.stat);
  assert.deepEqual(s.ledger.events, f.ledger.events);
  assert.deepEqual(digestFromCounts(s.kindCounts), buildDigest(full.events));
  assert.equal(s.servers, 3);
  assert.ok(s.ledger.fleet_events, 'a /3 summary still reads as /3');
  assert.ok(s.ledger.fleet_events.every((x) => x.members.length === 0), 'summary heads carry no members');
});

test('a capped summary keeps its totals from counts, not from the array lengths', () => {
  const s = parseLedgerSummary(summaryOf({}, 1), NOW);
  assert.ok(s);
  assert.equal(s.ledger.events.length, 1);
  assert.equal(s.eventsTotal, 3);
});

test('a /2 summary reads as /2', () => {
  const v2 = summaryOf({ ledger_schema: LEDGER_SCHEMA });
  delete v2.fleet_events;
  const s = parseLedgerSummary(v2, NOW);
  assert.ok(s);
  assert.equal(s.ledger.fleet_events, undefined);
});

test('summary is refused when stale, malformed, or inconsistent', () => {
  assert.equal(parseLedgerSummary(null, NOW), null);
  assert.equal(parseLedgerSummary('{nope', NOW), null);
  assert.equal(parseLedgerSummary(summaryOf(), NOW + SUMMARY_MAX_AGE_MS + 1), null, 'stale');
  assert.equal(parseLedgerSummary(summaryOf(), NOW - 6 * 60_000), null, 'dated ahead of the clock');
  assert.ok(parseLedgerSummary(summaryOf(), NOW - 4 * 60_000), 'inside the skew allowance');
  assert.ok(parseLedgerSummary(summaryOf(), NOW + SUMMARY_MAX_AGE_MS), 'at the age limit');
  assert.equal(parseLedgerSummary(summaryOf({ schema: 'mcpindex.drift.ledger-summary/2' }), NOW), null);
  assert.equal(parseLedgerSummary(summaryOf({ ledger_schema: 'mcpindex.drift.ledger/4' }), NOW), null);
  assert.equal(parseLedgerSummary(summaryOf({ counts: { events: 3, context_events: 1 } }), NOW), null, 'no servers count');
  assert.equal(parseLedgerSummary(summaryOf({ counts: { events: 2, context_events: 1, servers: 3 } }), NOW), null, 'more rows than the total');
  assert.equal(parseLedgerSummary(summaryOf({ kind_counts: { 'type-changed': -1 } }), NOW), null);
  assert.equal(parseLedgerSummary(summaryOf({ generated_at: 'yesterday' }), NOW), null);
  assert.equal(parseLedgerSummary(summaryOf({ fleet_events: [{ plane: 'tool' }] }), NOW), null, '/3 fail-closed');
});

test('a slice is refused when any row would be lost or belongs to another server', () => {
  assert.ok(parseServerSlice(sliceFor(A), A));
  assert.equal(parseServerSlice(sliceFor(A), B), null, 'filed under the wrong server');
  const bad = (over: Raw) => parseServerSlice({ ...sliceFor(A), ...over }, A);
  assert.equal(bad({ schema: 'x' }), null);
  assert.equal(bad({ events: 'nope' }), null);
  assert.equal(bad({ events: [...FULL.events.filter((e) => e.server_fp === A), { tool_fp: 'zz' }] }), null, 'a dropped row would be a false clean');
  const f = (sliceFor(C).fleet_events as Raw[])[0];
  assert.equal(parseServerSlice({ ...sliceFor(C), fleet_events: [{ ...f, members: [] }] }, C), null, 'fleet row with no member');
  assert.equal(parseServerSlice({ ...sliceFor(C), fleet_events: [{ ...f, day: 'Tuesday' }] }, C), null, 'strict /3 coercion');
});

test('digestFromCounts ignores inherited keys', () => {
  const counts = Object.create({ 'added-required-param': 5 }) as Record<string, number>;
  assert.deepEqual(digestFromCounts(counts), { standouts: [], benign: 0 });
});
