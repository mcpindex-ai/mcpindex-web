// Unit tests for the public drift ledger (M4, read side). Pins coercion gates and the
// flag-off fail-closed path. Run with `npx tsx --test lib/ledger.test.ts`. Live Redis
// hits are not exercised here (no creds in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  coerceContextEvent,
  coerceEvent,
  coerceFleetEvent,
  coerceFleetMember,
  coerceIndependent,
  coerceStat,
  ledgerEnabled,
  parseLedgerBlob,
} from './ledger';

const FP = '0b4796d16feb3912c0db0824c39e9b70';
const SCHEMA = 'mcpindex.drift.ledger/2';

test('ledgerEnabled is false when NEXT_PUBLIC_DRIFT_LEDGER is unset or not "1"', () => {
  delete process.env.NEXT_PUBLIC_DRIFT_LEDGER;
  assert.equal(ledgerEnabled(), false);
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '0';
  assert.equal(ledgerEnabled(), false);
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = 'true';
  assert.equal(ledgerEnabled(), false);
});

test('coerceEvent rejects a non-32hex tool_fp', () => {
  assert.equal(coerceEvent({ tool_fp: 'bad' }), null);
  assert.equal(coerceEvent({ tool_fp: FP.slice(0, 31) }), null);
});

test('coerceEvent floors sources to 1 when missing or <1', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.equal(coerceEvent(base)?.sources, 1);
  assert.equal(coerceEvent({ ...base, sources: 0 })?.sources, 1);
  assert.equal(coerceEvent({ ...base, sources: -3 })?.sources, 1);
  assert.equal(coerceEvent({ ...base, sources: 2.7 })?.sources, 2);
});

test('coerceEvent sets safety_relevant true only for boolean true', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.equal(coerceEvent(base)?.safety_relevant, false);
  assert.equal(coerceEvent({ ...base, safety_relevant: true })?.safety_relevant, true);
  assert.equal(coerceEvent({ ...base, safety_relevant: 'true' })?.safety_relevant, false);
  assert.equal(coerceEvent({ ...base, safety_relevant: 1 })?.safety_relevant, false);
});

test('coerceEvent allowlist-validates change_kinds; [] for an old blob or hostile value', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.deepEqual(coerceEvent(base)?.change_kinds, []); // old blob, field absent
  assert.deepEqual(
    coerceEvent({ ...base, change_kinds: ['type-changed', 'added-required-param', 'bogus-kind'] })?.change_kinds,
    ['added-required-param', 'type-changed'], // sorted, unknown dropped
  );
  assert.deepEqual(coerceEvent({ ...base, change_kinds: '["removed-param"]' })?.change_kinds, ['removed-param']);
  assert.deepEqual(coerceEvent({ ...base, change_kinds: '<script>' })?.change_kinds, []);
});

test('coerceEvent drops context-surface kinds from tool events (cross-plane misattribution)', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.deepEqual(
    coerceEvent({ ...base, change_kinds: ['instructions-changed', 'type-changed'] })?.change_kinds,
    ['type-changed'],
  );
  assert.deepEqual(coerceEvent({ ...base, change_kinds: ['prompt-args-changed'] })?.change_kinds, []);
});

test('coerceEvent blanks a bad server_fp', () => {
  const base = { tool_fp: FP, last_seen: '2026-01-01' };
  assert.equal(coerceEvent(base)?.server_fp, '');
  assert.equal(coerceEvent({ ...base, server_fp: 'not-hex' })?.server_fp, '');
  assert.equal(coerceEvent({ ...base, server_fp: FP })?.server_fp, FP);
});

test('coerceEvent keeps an hour-coarsened ISO last_seen and blanks anything else', () => {
  const base = { tool_fp: FP };
  assert.equal(
    coerceEvent({ ...base, last_seen: '2026-06-09T06:00:00Z' })?.last_seen,
    '2026-06-09T06:00:00Z',
  );
  assert.equal(coerceEvent({ ...base, last_seen: '2026-01-01' })?.last_seen, ''); // not the coarsened shape
  assert.equal(coerceEvent({ ...base, last_seen: 'x'.repeat(500) })?.last_seen, ''); // oversized
  assert.equal(coerceEvent({ ...base, last_seen: 42 })?.last_seen, ''); // non-string
});

test('coerceStat clamps negatives and NaN to 0', () => {
  assert.deepEqual(coerceStat({}), {
    tools_observed_drifting: 0,
    total_contract_drifts_observed: 0,
    servers: 0,
    safety_relevant: 0,
  });
  assert.deepEqual(
    coerceStat({
      tools_observed_drifting: -5,
      total_contract_drifts_observed: NaN,
      servers: 3.9,
      safety_relevant: -1,
    }),
    {
      tools_observed_drifting: 0,
      total_contract_drifts_observed: 0,
      servers: 3,
      safety_relevant: 0,
    },
  );
});

test('coerceStat maps each field to its own key (distinct values catch a field swap)', () => {
  assert.deepEqual(
    coerceStat({
      tools_observed_drifting: 11,
      total_contract_drifts_observed: 22,
      servers: 7,
      safety_relevant: 3,
    }),
    { tools_observed_drifting: 11, total_contract_drifts_observed: 22, servers: 7, safety_relevant: 3 },
  );
});

test('parseLedgerBlob: parses a JSON string blob, passes through an object blob', () => {
  const blob = {
    schema: SCHEMA,
    generated_at: '2026-06-09T06:00:00Z',
    framing: 'observed by the crawler',
    stat: { tools_observed_drifting: 2, total_contract_drifts_observed: 5, servers: 1, safety_relevant: 1 },
    events: [{ tool_fp: FP, server_fp: '', sources: 1, safety_relevant: true, last_seen: '2026-06-09T06:00:00Z' }],
  };
  const fromObject = parseLedgerBlob(blob);
  const fromString = parseLedgerBlob(JSON.stringify(blob));
  assert.deepEqual(fromObject, fromString);
  assert.equal(fromObject?.stat.tools_observed_drifting, 2);
  assert.equal(fromObject?.events.length, 1);
});

test('parseLedgerBlob: rejects missing, unparseable, wrong-schema, and non-array-events blobs', () => {
  assert.equal(parseLedgerBlob(null), null);
  assert.equal(parseLedgerBlob(undefined), null);
  assert.equal(parseLedgerBlob('{not json'), null);
  assert.equal(parseLedgerBlob(42), null);
  assert.equal(parseLedgerBlob({ schema: 'mcpindex.drift.ledger/1', events: [] }), null); // wrong version
  const noEvents = parseLedgerBlob({ schema: SCHEMA, stat: {}, events: 'oops' });
  assert.deepEqual(noEvents?.events, []); // non-array events -> [], not a throw
});

test('parseLedgerBlob: drops malformed events and bounds the free strings', () => {
  const out = parseLedgerBlob({
    schema: SCHEMA,
    generated_at: 'x'.repeat(99), // over the 32 cap -> blanked
    framing: 'y'.repeat(999), // over the 280 cap -> blanked
    stat: {},
    events: [
      { tool_fp: FP, last_seen: '2026-06-09T06:00:00Z' }, // valid
      { tool_fp: 'not-hex' }, // dropped
      'garbage', // dropped
    ],
  });
  assert.equal(out?.generated_at, '');
  assert.equal(out?.framing, '');
  assert.equal(out?.events.length, 1);
});

// loadLedger lives in ledgerServer.ts (import 'server-only', not importable in plain node). Its
// only logic beyond parseLedgerBlob (tested above) is `if (!ledgerEnabled()) return null` + a
// guarded redis().get - both trivial and covered by the ledgerEnabled + parseLedgerBlob tests.

test('coerceEvent removal_scope: allowlist coercion, absent when invalid or missing (schema stays /2)', () => {
  const base = { tool_fp: FP, change_kinds: ['tool-removed'] };
  assert.equal(coerceEvent({ ...base, removal_scope: 'toolset-replaced' })?.removal_scope, 'toolset-replaced');
  assert.equal(coerceEvent({ ...base, removal_scope: 'single' })?.removal_scope, 'single');
  assert.equal(coerceEvent({ ...base, removal_scope: 'bulk' })?.removal_scope, undefined);
  assert.equal(coerceEvent({ ...base, removal_scope: 42 })?.removal_scope, undefined);
  assert.equal(coerceEvent(base)?.removal_scope, undefined);
  // The removal-context field is ADDITIVE on /2 - the schema string must not have moved.
  assert.equal(SCHEMA, 'mcpindex.drift.ledger/2');
});

test('coerceEvent version_delta: allowlist all four states; invalid/missing -> absent', () => {
  const base = { tool_fp: FP };
  for (const v of ['same', 'changed', 'undeclared', 'not-recorded'] as const) {
    assert.equal(coerceEvent({ ...base, version_delta: v })?.version_delta, v);
  }
  assert.equal(coerceEvent({ ...base, version_delta: 'bumped' })?.version_delta, undefined);
  assert.equal(coerceEvent(base)?.version_delta, undefined);
});

test('coerceStat silent_same_version: present only when valid; absence is not zero', () => {
  assert.equal(coerceStat({ silent_same_version: 42 }).silent_same_version, 42);
  assert.equal(coerceStat({ silent_same_version: 0 }).silent_same_version, 0);
  assert.equal(coerceStat({}).silent_same_version, undefined);
  assert.equal(coerceStat({ silent_same_version: -1 }).silent_same_version, undefined);
  assert.equal(coerceStat({ silent_same_version: 'many' }).silent_same_version, undefined);
});

test('lede copy pin (spec 2.4b): DriftReport carries the re-pinned basis-named string, no banned framings', () => {
  const src = fs.readFileSync(new URL('../components/DriftReport.tsx', import.meta.url), 'utf8');
  assert.ok(src.includes('only ever changed'), 'pinned lede fragment missing');
  assert.ok(src.includes('declared version unchanged, where version evidence exists'), 'pinned lede tail missing');
  assert.ok(!src.includes('never shipped a change alongside a version change'), 'old v3 lede wording banned');
  assert.ok(!/%\s*silent/.test(src), 'bare report-headline framing banned on /ledger lede');
  assert.ok(!src.includes('version bumped'), "'bumped' asserts direction the data does not carry");
});

test('cross-plane contract (spec 2.4b): a REAL flag-on build_ledger blob survives web coercion field-complete', () => {
  const raw = fs.readFileSync(new URL('../test/fixtures/ledger-evidence-on.json', import.meta.url), 'utf8');
  const ledger = parseLedgerBlob(raw);
  assert.ok(ledger, 'fixture must parse');
  assert.equal(ledger.events.length, 5, 'no event dropped in coercion');
  const deltas = ledger.events.map((e) => e.version_delta);
  for (const v of ['same', 'changed', 'undeclared', 'not-recorded']) {
    assert.ok(deltas.includes(v as never), `version_delta '${v}' must survive`);
  }
  assert.equal(ledger.stat.silent_same_version, 2, 'silent stat must survive');
  const scopes = ledger.events.map((e) => e.removal_scope).filter(Boolean);
  assert.deepEqual(scopes.sort(), ['single', 'toolset-replaced'], 'both scopes survive');
  // Chip-variant coverage: every renderable state present in one fixture.
  const renderable = ledger.events.filter((e) => e.version_delta && e.version_delta !== 'not-recorded');
  assert.equal(renderable.length, 4, 'three chip variants + one suppressed (not-recorded)');
});

// ---- server-scoped context events (the drain's out-of-band emit leg) ----

const CTX = { server_fp: FP, sources: 1, safety_relevant: true, last_seen: '2026-08-19T05:00:00Z', change_kinds: ['instructions-changed'] };

test('coerceContextEvent: valid row survives; identity and kinds are load-bearing', () => {
  const e = coerceContextEvent(CTX);
  assert.ok(e);
  assert.deepEqual(e?.change_kinds, ['instructions-changed']);
  assert.equal(e?.server_fp, FP);
  assert.equal(e?.last_seen, '2026-08-19T05:00:00Z');
  // Unattributable or kind-less rows are unrenderable and must drop (stricter than
  // coerceEvent's server_fp blanking).
  assert.equal(coerceContextEvent({ ...CTX, server_fp: 'not-hex' }), null);
  assert.equal(coerceContextEvent({ ...CTX, server_fp: undefined }), null);
  assert.equal(coerceContextEvent({ ...CTX, change_kinds: [] }), null);
  assert.equal(coerceContextEvent({ ...CTX, change_kinds: ['bogus'] }), null);
  // A tool kind here is a taxonomy breach upstream; it is filtered, and a row left with no
  // context kind drops entirely.
  assert.equal(coerceContextEvent({ ...CTX, change_kinds: ['type-changed'] }), null);
  assert.deepEqual(
    coerceContextEvent({ ...CTX, change_kinds: ['type-changed', 'prompt-args-changed'] })?.change_kinds,
    ['prompt-args-changed'],
  );
  // Same TS_RE gate as coerceEvent: exact-shape timestamps pass, anything else blanks.
  assert.equal(coerceContextEvent({ ...CTX, last_seen: '2026-08-19 05:00' })?.last_seen, '');
  assert.equal(coerceContextEvent({ ...CTX, last_seen: 42 })?.last_seen, '');
});

test('parseLedgerBlob: context_events is [] when absent (old blob) and coerced when present', () => {
  const old = parseLedgerBlob({ schema: SCHEMA, stat: {}, events: [] });
  assert.deepEqual(old?.context_events, []);
  const out = parseLedgerBlob({
    schema: SCHEMA,
    stat: {},
    events: [],
    context_events: [CTX, { ...CTX, server_fp: 'bad' }, 'junk', null],
  });
  assert.equal(out?.context_events.length, 1);
  assert.equal(out?.context_events[0]?.server_fp, FP);
});

test('parseLedgerBlob: an unknown top-level key is ignored, never fatal (the additive-array contract)', () => {
  // The drain relies on this semantic to ship new top-level arrays without a coordinated
  // deploy: a reader that predates the key must keep serving everything it understands.
  const out = parseLedgerBlob({
    schema: SCHEMA,
    stat: { tools_observed_drifting: 1 },
    events: [{ tool_fp: FP, last_seen: '2026-08-19T05:00:00Z' }],
    some_future_array: [{ anything: true }],
  });
  assert.ok(out);
  assert.equal(out?.events.length, 1);
  assert.equal(out?.stat.tools_observed_drifting, 1);
});

test('coerceStat context_surfaces_drifting: present only when valid; absence is not zero', () => {
  assert.equal(coerceStat({}).context_surfaces_drifting, undefined);
  assert.equal(coerceStat({ context_surfaces_drifting: 3 }).context_surfaces_drifting, 3);
  assert.equal(coerceStat({ context_surfaces_drifting: -1 }).context_surfaces_drifting, undefined);
  assert.equal(coerceStat({ context_surfaces_drifting: 'x' }).context_surfaces_drifting, undefined);
});

// ---- ledger /3: publisher-wide changes counted once (tasks/spec-ledger-fleet-collapse-2026-09-25.md) ----

const SCHEMA_V3 = 'mcpindex.drift.ledger/3';
const omit = (o: object, ...keys: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
const PUB = 'c'.repeat(32);
const TOTAL = {
  tools_observed_drifting: 100,
  total_contract_drifts_observed: 140,
  servers: 20,
  safety_relevant: 30,
  silent_same_version: 80,
  context_surfaces_drifting: 5,
};
const IND = {
  tools_observed_drifting: 25,
  servers: 8,
  safety_relevant: 20,
  silent_same_version: 15,
  context_surfaces_drifting: 4,
  fleet_changes: 2,
  fleet_tools: 78,
  fleet_servers: 12,
  context_fleet_changes: 1,
  context_fleet_surfaces: 3,
};
const MEMBER = { server_fp: FP, page_tools: 3, last_seen: '2026-09-24T04:00:00Z', safety_relevant: false, toolset_replaced: false };
const FLEET = {
  plane: 'tool',
  publisher_fp: PUB,
  day: '2026-09-24',
  change_kinds: ['added-optional-param'],
  safety_relevant: false,
  servers: 12,
  tools: 78,
  members: [MEMBER],
};
const BLOB_V3 = {
  schema: SCHEMA_V3,
  generated_at: '2026-09-25T20:00:00Z',
  framing: 'observed',
  stat: { ...TOTAL, independent: IND },
  events: [{ tool_fp: FP, server_fp: FP, sources: 1, safety_relevant: false, last_seen: '2026-09-25T04:00:00Z', change_kinds: ['type-changed'] }],
  context_events: [],
  // Matches IND: two tool-plane fleets and one context fleet.
  fleet_events: [
    FLEET,
    { ...FLEET, day: '2026-09-10' },
    { ...FLEET, plane: 'context', change_kinds: ['instructions-changed'], servers: 3, tools: 3 },
  ],
};

test('/2 blob: parse output keeps exactly its /2 keys, even when the blob carries /3 fields', () => {
  const l = parseLedgerBlob({ ...BLOB_V3, schema: SCHEMA });
  assert.ok(l);
  assert.equal(l.schema, SCHEMA);
  assert.deepEqual(Object.keys(l), ['schema', 'generated_at', 'framing', 'stat', 'events', 'context_events']);
  assert.equal('independent' in l.stat, false, '/2 never promised the twin');
});

test('/3 blob: schema passes through, fleet_events and the independent twin survive', () => {
  const l = parseLedgerBlob(JSON.stringify(BLOB_V3));
  assert.ok(l);
  assert.equal(l.schema, SCHEMA_V3, 'the API must never serve /3 content under the /2 string');
  assert.deepEqual(l.stat.independent, IND);
  assert.equal(l.stat.tools_observed_drifting, 100, 'the total keeps its /2 meaning');
  assert.equal(l.fleet_events?.length, 3);
  assert.deepEqual(l.fleet_events?.[0].members, [MEMBER]);
});

test('an unknown schema version is still refused', () => {
  assert.equal(parseLedgerBlob({ ...BLOB_V3, schema: 'mcpindex.drift.ledger/4' }), null);
});

test('coerceIndependent is all-or-nothing: a partial twin is absent, never zero-filled', () => {
  const total = coerceStat(TOTAL);
  assert.deepEqual(coerceIndependent(IND, total), IND);
  assert.equal(coerceIndependent(omit(IND, 'fleet_changes'), total), undefined);
  assert.equal(coerceIndependent({ ...IND, servers: -1 }, total), undefined);
  assert.equal(coerceIndependent({ ...IND, servers: 'many' }, total), undefined);
  assert.equal(coerceIndependent(null, total), undefined);
  // Number('') is 0: a twin of blanks must not read as a twin of zeros.
  const blanks = Object.fromEntries(Object.keys(IND).map((k) => [k, '']));
  assert.equal(coerceIndependent(blanks, total), undefined);
});

test('coerceIndependent: the two parts must cover the total and agree with the fleet list', () => {
  const total = coerceStat(TOTAL);
  // 25 independent + 0 fleet tools cannot account for 100 tools.
  assert.equal(coerceIndependent({ ...IND, fleet_tools: 0, fleet_changes: 0, fleet_servers: 0 }, total), undefined);
  assert.equal(coerceIndependent({ ...IND, servers: 1, fleet_servers: 1 }, total), undefined, 'servers do not cover');
  assert.equal(coerceIndependent({ ...IND, fleet_changes: 0 }, total), undefined, 'fleet tools with no fleet');
  assert.equal(coerceIndependent({ ...IND, fleet_servers: 21 }, total), undefined);
  assert.equal(coerceIndependent({ ...IND, context_fleet_surfaces: 6 }, total), undefined);
  const ctxFleet = coerceFleetEvent({ ...FLEET, plane: 'context', change_kinds: ['instructions-changed'] })!;
  const fleets = [coerceFleetEvent(FLEET)!, coerceFleetEvent({ ...FLEET, day: '2026-09-10' })!, ctxFleet];
  assert.ok(coerceIndependent(IND, total, fleets), 'two tool fleets and one context fleet, as IND says');
  assert.equal(coerceIndependent(IND, total, fleets.slice(1)), undefined, 'fleet_changes disagrees with the list');
  assert.equal(coerceIndependent(IND, total, fleets.slice(0, 2)), undefined, 'context_fleet_changes disagrees');
});

test('coerceIndependent refuses a twin larger than the total it is a subset of', () => {
  const total = coerceStat(TOTAL);
  assert.equal(coerceIndependent({ ...IND, tools_observed_drifting: 101 }, total), undefined);
  assert.equal(coerceIndependent({ ...IND, servers: 21 }, total), undefined);
  assert.equal(coerceIndependent({ ...IND, safety_relevant: 26 }, total), undefined, 'safety > its own tools');
  assert.equal(coerceIndependent({ ...IND, fleet_tools: 101 }, total), undefined);
  assert.equal(coerceIndependent({ ...IND, silent_same_version: 26 }, total), undefined);
  // A silent twin with no silent total has nothing to be a subset of.
  assert.equal(coerceIndependent(IND, coerceStat(omit(TOTAL, 'silent_same_version'))), undefined);
  // Optional twins stay optional.
  const bare = omit(IND, 'silent_same_version', 'context_surfaces_drifting');
  assert.deepEqual(coerceIndependent(bare, total), bare);
});

test('/3 with a malformed twin: totals still render, the twin is simply absent', () => {
  const l = parseLedgerBlob({ ...BLOB_V3, stat: { ...TOTAL, independent: { ...IND, tools_observed_drifting: 999 } } });
  assert.ok(l);
  assert.equal(l.stat.independent, undefined);
  assert.equal(l.stat.tools_observed_drifting, 100);
});

test('coerceFleetEvent: identity, plane, day and displayable kinds are load-bearing', () => {
  assert.ok(coerceFleetEvent(FLEET));
  assert.equal(coerceFleetEvent({ ...FLEET, plane: 'fleet' }), null);
  assert.equal(coerceFleetEvent({ ...FLEET, publisher_fp: 'io.github.someone' }), null, 'never a raw name');
  assert.equal(coerceFleetEvent({ ...FLEET, day: '2026-09-24T04:00:00Z' }), null);
  // Unknown kinds are dropped from display but the event, and so its members' counts, stays: a
  // drain that learns a new kind before this reader does must not produce a false clean.
  assert.deepEqual(coerceFleetEvent({ ...FLEET, change_kinds: ['not-a-kind'] })?.change_kinds, []);
  // Cross-plane rule, as in coerceEvent: a tool fleet never displays a context kind.
  assert.deepEqual(coerceFleetEvent({ ...FLEET, change_kinds: ['instructions-changed'] })?.change_kinds, []);
  const ctx = coerceFleetEvent({ ...FLEET, plane: 'context', change_kinds: ['instructions-changed', 'type-changed'] });
  assert.deepEqual(ctx?.change_kinds, ['instructions-changed']);
});

test('coerceFleetEvent: a bad member, a duplicate member or a bad tool fp rejects the event', () => {
  // Dropping a member would make that server read "no changes": fail closed instead.
  assert.equal(coerceFleetEvent({ ...FLEET, members: [MEMBER, { ...MEMBER, server_fp: 'nope' }] }), null);
  assert.equal(coerceFleetEvent({ ...FLEET, members: [MEMBER, null] }), null);
  assert.equal(coerceFleetEvent({ ...FLEET, members: [MEMBER, MEMBER] }), null, 'duplicate server');
  assert.equal(coerceFleetEvent({ ...FLEET, members: 'all' }), null);
  assert.equal(coerceFleetEvent({ ...FLEET, servers: 0 }), null, 'fewer servers than members');
  assert.equal(coerceFleetEvent({ ...FLEET, tools: '78' }), null, 'a count must be a number');
  assert.equal(coerceFleetEvent({ ...FLEET, safety_relevant: true, tool_fps: [FP, 'bad'] }), null);
  assert.deepEqual(coerceFleetEvent({ ...FLEET, safety_relevant: true, tool_fps: [FP] })?.tool_fps, [FP]);
  assert.equal(coerceFleetEvent(FLEET)?.tool_fps, undefined, 'absent unless the blob lists them');
});

test('parseLedgerBlob /3 fails closed: one broken fleet event makes the whole blob unavailable', () => {
  assert.equal(parseLedgerBlob({ ...BLOB_V3, fleet_events: [FLEET, { ...FLEET, day: 'Tuesday' }] }), null);
  assert.equal(parseLedgerBlob({ ...BLOB_V3, fleet_events: undefined }), null, '/3 without fleet_events');
  assert.equal(parseLedgerBlob({ ...BLOB_V3, fleet_events: 'none' }), null);
  assert.equal(parseLedgerBlob({ ...BLOB_V3, fleet_events: Array(10_001).fill(FLEET) }), null, 'cap hit');
  assert.ok(parseLedgerBlob({ ...BLOB_V3, fleet_events: [] }), 'an empty fleet list is valid');
});

test('coerceFleetMember: version counts are absent unless emitted (evidence interlock), never zero', () => {
  const m = coerceFleetMember(MEMBER);
  assert.ok(m);
  assert.equal('version_same' in m, false);
  const e = coerceFleetMember({ ...MEMBER, version_same: 2, version_changed: 0, version_undeclared: 1 });
  assert.equal(e?.version_same, 2);
  assert.equal(e?.version_changed, 0);
  assert.equal(coerceFleetMember({ ...MEMBER, last_seen: 'yesterday' })?.last_seen, '');
  // page_tools is load-bearing for the server's change count: missing or malformed rejects.
  for (const bad of [-3, undefined, null, '', ' ', '3', [3], true, 1.5, 1e308]) {
    assert.equal(coerceFleetMember({ ...MEMBER, page_tools: bad }), null, `page_tools ${JSON.stringify(bad)}`);
  }
  assert.equal(coerceFleetMember({ ...MEMBER, version_same: '' }), null);
  // The version counts cover page_tools tools only, so they can never add up to more.
  assert.equal(coerceFleetMember({ ...MEMBER, page_tools: 1, version_same: 2 }), null);
  assert.ok(coerceFleetMember({ ...MEMBER, page_tools: 3, version_same: 2, version_changed: 1 }));
});

test('fingerprint copy (D10): no page claims a fingerprint hides the server', () => {
  for (const f of ['../components/DriftReport.tsx', '../app/ledger/page.tsx']) {
    const src = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.ok(!src.includes('without publicly naming'), `${f}: the key is public, so this is false`);
    assert.ok(!src.includes('never a named server'), `${f}: the key is public, so this is false`);
  }
});

