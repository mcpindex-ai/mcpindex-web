// loadServerDrift with the ledger split: answers from the per-server hash when the split is
// usable, and is unavailable (null) whenever it is not. The retired full blob is never read. The
// pure parsing is in lib/ledgerSplit.test.ts; this covers when the split may answer, which is
// where a false clean would come from.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { snapshotEnv } from './_harness';
import { __setLedgerServerRedisForTest } from '../../lib/ledgerServer';
import { loadServerDrift } from '../../lib/serverDriftServer';
import { serverFp } from '../../lib/driftFingerprint';
import { LEDGER_SERVER_SCHEMA, LEDGER_SUMMARY_SCHEMA } from '../../lib/ledgerSplit';

const NAME = 'io.example/split-loader-test';
const FP = serverFp(NAME);
const NOW_ISO = new Date(Math.floor(Date.now() / 3600_000) * 3600_000).toISOString().replace('.000Z', 'Z');
const ev = (tool: string, kinds: string[]) => ({
  tool_fp: tool.repeat(32), server_fp: FP, sources: 1, safety_relevant: false,
  last_seen: '2026-10-13T03:00:00Z', change_kinds: kinds,
});

const summary = (over: Record<string, unknown> = {}) => JSON.stringify({
  schema: LEDGER_SUMMARY_SCHEMA, ledger_schema: 'mcpindex.drift.ledger/3', generated_at: NOW_ISO,
  framing: 'observed', stat: { tools_observed_drifting: 2, servers: 1 }, events: [], context_events: [],
  fleet_events: [], kind_counts: {}, version_evidence: false,
  counts: { events: 2, context_events: 0, fleet_events: 0, servers: 5 }, ...over,
});
const SLICE = JSON.stringify({
  schema: LEDGER_SERVER_SCHEMA, events: [ev('1', ['type-changed']), ev('2', ['removed-param'])],
  context_events: [], fleet_events: [],
});
const gz1 = (s: string) => 'gz1:' + gzipSync(Buffer.from(s)).toString('base64');

interface Fake { summary?: string | null; hlen?: number | Error; field?: string | null | Error }
function fake(f: Fake) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      async get(key: string) {
        calls.push(`get ${key}`);
        if (key === 'drift:ledger:summary') return f.summary ?? null;
        if (key === 'drift:ledger') throw new Error('the retired full blob was read');
        return null;
      },
      async hlen(key: string) {
        calls.push(`hlen ${key}`);
        if (f.hlen instanceof Error) throw f.hlen;
        return f.hlen ?? 5;
      },
      async hget(key: string, field: string) {
        calls.push(`hget ${key}`);
        assert.equal(field, FP);
        if (f.field instanceof Error) throw f.field;
        return f.field === undefined ? SLICE : f.field;
      },
    },
  };
}

const G = globalThis as Record<string, unknown>;
let restore: () => void;
beforeEach(() => {
  restore = snapshotEnv();
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  for (const k of ['__mcpiSplitMemo', '__mcpiSplitInflight']) delete G[k];
});
afterEach(() => {
  __setLedgerServerRedisForTest(undefined);
  delete process.env.NEXT_PUBLIC_DRIFT_LEDGER;
  restore();
});

async function run(f: Fake) {
  const r = fake(f);
  __setLedgerServerRedisForTest(r.client as never);
  return { drift: await loadServerDrift(NAME), calls: r.calls };
}

test('split usable: answers from the server field', async () => {
  const { drift, calls } = await run({ summary: summary(), field: gz1(SLICE) });
  assert.equal(drift?.changes, 2);
  assert.ok(!calls.includes('get drift:ledger'), calls.join(','));
  assert.ok(calls.indexOf('get drift:ledger:summary') < calls.indexOf('hget drift:ledger:servers'), 'summary before hash');
});

test('split usable and no field: the server is clean, from the split', async () => {
  const { drift, calls } = await run({ summary: summary(), field: null });
  assert.equal(drift?.changes, 0);
  assert.ok(!calls.includes('get drift:ledger'));
});

for (const [why, f] of [
  ['no summary', { summary: null }],
  ['stale summary', { summary: summary({ generated_at: '2026-01-01T00:00:00Z' }) }],
  ['hash shorter than the summary says (lost or evicted)', { summary: summary(), hlen: 0 }],
  ['HLEN fails', { summary: summary(), hlen: new Error('upstash 500') }],
  ['HGET fails', { summary: summary(), field: new Error('upstash 500') }],
  ['field does not decode', { summary: summary(), field: 'gz1:!!!!' }],
] as Array<[string, Fake]>) {
  test(`${why}: unavailable (null), never clean, never the full blob`, async () => {
    const { drift, calls } = await run(f);
    assert.equal(drift, null, calls.join(','));
    assert.ok(!calls.includes('get drift:ledger'));
  });
}

test('a malformed field is unavailable, never a clean answer with the bad row dropped', async () => {
  const bad = JSON.stringify({ ...JSON.parse(SLICE), events: [{ tool_fp: 'zz' }] });
  const { drift } = await run({ summary: summary(), field: bad });
  assert.equal(drift, null);
});

test('hash lost after the memo said usable: a missing field re-checks HLEN and is unavailable', async () => {
  const first = await run({ summary: summary(), field: gz1(SLICE) });
  assert.equal(first.drift?.changes, 2);
  // Same memo (not cleared): the hash is now gone.
  const { drift, calls } = await run({ summary: summary(), field: null, hlen: 0 });
  assert.equal(drift, null, calls.join(','));
  assert.ok(calls.includes('hlen drift:ledger:servers'), 'fresh HLEN on a missing field');
});

test('a summary dated in the future is refused', async () => {
  const ahead = new Date(Date.now() + 3600_000).toISOString();
  const { drift } = await run({ summary: summary({ generated_at: ahead }) });
  assert.equal(drift, null);
});

test('summary and field delivered as objects (the client auto-deserializes plain JSON) still work', async () => {
  const r = fake({});
  const client = {
    ...r.client,
    async get(key: string) { const v = await r.client.get(key); return key === 'drift:ledger:summary' ? JSON.parse(summary()) : v; },
    async hget(key: string, field: string) { await r.client.hget(key, field); return JSON.parse(SLICE); },
  };
  __setLedgerServerRedisForTest(client as never);
  const drift = await loadServerDrift(NAME);
  assert.equal(drift?.changes, 2);
  assert.ok(!r.calls.includes('get drift:ledger'));
});

test('versionEvidence comes from the summary, not from the server rows', async () => {
  const on = await run({ summary: summary({ version_evidence: true }), field: null });
  assert.equal(on.drift?.versionEvidence, 'recorded');
  for (const k of ['__mcpiSplitMemo', '__mcpiSplitInflight']) delete G[k];
  const off = await run({ summary: summary({ version_evidence: false }), field: null });
  assert.equal(off.drift?.versionEvidence, 'unavailable');
});
