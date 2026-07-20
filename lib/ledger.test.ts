// Unit tests for the public drift ledger (M4, read side). Pins coercion gates and the
// flag-off fail-closed path. Run with `npx tsx --test lib/ledger.test.ts`. Live Redis
// hits are not exercised here (no creds in CI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { coerceEvent, coerceStat, ledgerEnabled, parseLedgerBlob } from './ledger';

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
