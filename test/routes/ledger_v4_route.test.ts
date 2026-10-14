// /api/v1/ledger, schema /4: paged reads over the drain's v4 index and pages only. Neither the
// split summary nor the retired drift:ledger blob is read. The pure codec and parsers are in lib/ledgerV4.test.ts.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { callRoute, snapshotEnv } from './_harness';
import { __setLedgerServerRedisForTest } from '../../lib/ledgerServer';
import { __setRatelimitRedisForTest } from '../../lib/ratelimit';
import { LEDGER_INDEX_SCHEMA, LEDGER_PAGE_SCHEMA, encodeCursor, genStampOf } from '../../lib/ledgerV4';
import { GET as ledger } from '../../app/api/v1/ledger/route';

const AT = new Date(Math.floor(Date.now() / 3600_000) * 3600_000).toISOString().replace('.000Z', 'Z');
const GEN = `${genStampOf(AT)}-0123abcd`;
const OLD_GEN = '20260101T000000Z-89abcdef';
const FP = 'a'.repeat(32);
const gz1 = (v: unknown) => 'gz1:' + gzipSync(Buffer.from(JSON.stringify(v))).toString('base64');

const ev = (i: number) => ({
  tool_fp: i.toString(16).padStart(32, '0'), server_fp: FP, sources: 1, safety_relevant: false,
  last_seen: '2026-10-14T15:00:00Z', change_kinds: ['added-required-param'],
});
const INDEX = {
  schema: LEDGER_INDEX_SCHEMA, gen: GEN, generated_at: AT, digest: 'sha256:x',
  ledger_schema: 'mcpindex.drift.ledger/3', framing: 'observed',
  stat: { tools_observed_drifting: 5, total_contract_drifts_observed: 9, servers: 1, safety_relevant: 0 },
  pages: { events: 3, context_events: 0, fleet_events: 0 }, counts: { events: 5, context_events: 0, fleet_events: 0 },
};
// Three pages of events: [1,2] [3,4] [5].
const PAGES: Record<string, unknown> = {};
[[1, 2], [3, 4], [5]].forEach((rows, n) => {
  PAGES[`drift:ledger:v4:${GEN}:events:${n}`] = gz1({ schema: LEDGER_PAGE_SCHEMA, gen: GEN, section: 'events', n, items: rows.map(ev) });
});
PAGES[`drift:ledger:v4:${OLD_GEN}:events:1`] = gz1({ schema: LEDGER_PAGE_SCHEMA, gen: OLD_GEN, section: 'events', n: 1, items: [ev(9)] });

interface Store { index?: unknown; pages?: Record<string, unknown> }
function install(s: Store = {}) {
  const calls: string[] = [];
  __setLedgerServerRedisForTest({
    async get(key: string) {
      calls.push(key);
      if (key === 'drift:ledger') throw new Error('the retired full blob was read');
      if (key === 'drift:ledger:summary') throw new Error('the /4 route does not need the summary');
      if (key === 'drift:ledger:v4:index') return 'index' in s ? s.index : gz1(INDEX);
      return (s.pages ?? PAGES)[key] ?? null;
    },
  } as never);
  return calls;
}

let restore: () => void;
beforeEach(() => {
  restore = snapshotEnv();
  process.env.NEXT_PUBLIC_DRIFT_LEDGER = '1';
  __setRatelimitRedisForTest(null); // fail-open limiter: these tests are about the ledger
});
afterEach(() => {
  __setLedgerServerRedisForTest(undefined);
  __setRatelimitRedisForTest(undefined);
  restore();
});

const body = (r: { json: () => unknown }) => r.json() as Record<string, any>;

test('no params: 200, page 0 of events, with stat, framing and generated_at from the index, no-store', async () => {
  const calls = install();
  const r = await callRoute(ledger, '/api/v1/ledger');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('cache-control') ?? '', /no-store/);
  const b = body(r);
  assert.equal(b.schema, 'mcpindex.drift.ledger/4');
  assert.equal(b.generated_at, AT);
  assert.equal(b.generation, GEN);
  assert.equal(b.ledger_schema, 'mcpindex.drift.ledger/3');
  assert.equal(b.framing, 'observed');
  assert.equal(b.stat.tools_observed_drifting, 5);
  assert.deepEqual(b.counts, INDEX.counts);
  assert.equal(b.section, 'events');
  assert.equal(b.page, 0);
  assert.equal(b.pages, 3);
  assert.equal(b.items.length, 2);
  assert.equal(typeof b.next_cursor, 'string');
  assert.ok(!calls.includes('drift:ledger'));
});

test('next_cursor chains to the last page, every page carrying stat and generated_at', async () => {
  install();
  const seen: number[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 5; i++) {
    const r = await callRoute(ledger, '/api/v1/ledger', cursor ? { query: { cursor } } : {});
    assert.equal(r.status, 200);
    const b = body(r);
    assert.equal(b.page, i);
    assert.equal(b.generated_at, AT);
    assert.equal(b.generation, GEN);
    assert.equal(b.stat.tools_observed_drifting, 5);
    seen.push(...b.items.map((e: { tool_fp: string }) => parseInt(e.tool_fp, 16)));
    cursor = b.next_cursor;
    if (cursor === null) break;
  }
  assert.equal(cursor, null);
  assert.deepEqual(seen, [1, 2, 3, 4, 5]);
});

test('an empty section answers 200 with no rows and reads no page', async () => {
  const calls = install();
  const r = await callRoute(ledger, '/api/v1/ledger', { query: { section: 'fleet_events' } });
  assert.equal(r.status, 200);
  const b = body(r);
  assert.equal(b.pages, 0);
  assert.deepEqual(b.items, []);
  assert.equal(b.next_cursor, null);
  assert.ok(!calls.some((k) => k.includes(':fleet_events:')));
});

test('a cursor into a superseded generation still reads while its pages live', async () => {
  install();
  const cursor = encodeCursor({ gen: OLD_GEN, section: 'events', n: 1, pages: 2 });
  const r = await callRoute(ledger, '/api/v1/ledger', { query: { cursor } });
  assert.equal(r.status, 200);
  const b = body(r);
  assert.equal(b.generated_at, AT, 'generated_at is the latest publish on every page');
  assert.equal(b.generation, OLD_GEN, 'the items generation travels separately');
  assert.equal(b.page, 1);
  assert.equal(b.pages, 2);
  assert.equal(b.items.length, 1);
  assert.equal(b.next_cursor, null);
});

test('a cursor whose generation expired is 410 cursor_expired with a restart URL', async () => {
  install();
  const cursor = encodeCursor({ gen: OLD_GEN, section: 'events', n: 0, pages: 2 });
  const r = await callRoute(ledger, '/api/v1/ledger', { query: { cursor } });
  assert.equal(r.status, 410);
  const b = body(r);
  assert.equal(b.error, 'cursor_expired');
  assert.equal(b.restart, '/api/v1/ledger?section=events');
  assert.equal('items' in b, false);
});

for (const [why, store] of [
  ['index missing', { index: null }],
  ['index stale', { index: gz1({ ...INDEX, generated_at: '2026-01-01T00:00:00Z', gen: OLD_GEN }) }],
  ['index malformed', { index: 'gz1:!!!!' }],
  ['index without stat', { index: gz1({ ...INDEX, stat: undefined }) }],
  ['index names a page that is not there', { pages: {} }],
  ['page fails validation', { pages: { [`drift:ledger:v4:${GEN}:events:0`]: gz1({ schema: 'x' }) } }],
] as Array<[string, Store]>) {
  test(`${why}: 503 with no rows, and the full blob is never read`, async () => {
    const calls = install(store);
    const r = await callRoute(ledger, '/api/v1/ledger');
    assert.equal(r.status, 503, why);
    const b = body(r);
    assert.equal(b.error, 'unavailable');
    assert.equal('items' in b, false);
    assert.ok(!calls.includes('drift:ledger'));
  });
}

for (const [why, query] of [
  ['garbage cursor', { cursor: 'not-a-cursor' }],
  ['cursor with a key-shaped payload', { cursor: Buffer.from(`${GEN}:*.events.0.1`).toString('base64url') }],
  ['cursor with an old-format gen', { cursor: Buffer.from(`${genStampOf(AT)}.events.0.3`).toString('base64url') }],
  ['cursor past the live index', { cursor: encodeCursor({ gen: GEN, section: 'events', n: 3, pages: 9 }) }],
  ['unknown section', { section: 'tools' }],
  ['section disagrees with the cursor', { section: 'fleet_events', cursor: encodeCursor({ gen: GEN, section: 'events', n: 1, pages: 3 }) }],
] as Array<[string, Record<string, string>]>) {
  test(`${why}: 400`, async () => {
    const calls = install();
    const r = await callRoute(ledger, '/api/v1/ledger', { query });
    assert.equal(r.status, 400);
    assert.ok(!calls.some((k) => k.startsWith('drift:ledger:v4:') && k !== 'drift:ledger:v4:index'), 'no page read');
  });
}

test('a generation kept across unchanged hours still serves (gen stamp older than generated_at)', async () => {
  const kept = `20260101T000000Z-0123abcd`;
  const pages = { [`drift:ledger:v4:${kept}:events:0`]: gz1({ schema: LEDGER_PAGE_SCHEMA, gen: kept, section: 'events', n: 0, items: [ev(1)] }) };
  install({ index: gz1({ ...INDEX, gen: kept, pages: { events: 1, context_events: 0, fleet_events: 0 } }), pages });
  const r = await callRoute(ledger, '/api/v1/ledger');
  assert.equal(r.status, 200);
  const b = body(r);
  assert.equal(b.generation, kept);
  assert.equal(b.generated_at, AT);
  assert.equal(b.items.length, 1);
});
