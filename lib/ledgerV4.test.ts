import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEDGER_INDEX_SCHEMA,
  LEDGER_PAGE_SCHEMA,
  LEDGER_SCHEMA_V4,
  MAX_PAGES,
  decodeCursor,
  encodeCursor,
  genStampOf,
  pageKey,
  parseLedgerIndex,
  parseLedgerPage,
  type LedgerCursor,
} from './ledgerV4';
import { SUMMARY_MAX_AGE_MS } from './ledgerSplit';
import { LedgerWalkError, walkLedgerSection } from './ledgerV4Client';

const AT = '2026-10-14T16:01:53Z';
const STAMP = '20261014T160153Z';
const GEN = `${STAMP}-1a2b3c4d`;
const NOW = Date.parse(AT) + 60_000;

test('genStampOf formats generated_at as a generation id starts', () => {
  assert.equal(genStampOf(AT), STAMP);
  assert.equal(genStampOf('2026-10-14T16:01:53.900Z'), STAMP, 'sub-second precision is dropped');
  assert.equal(genStampOf('not a date'), null);
});

test('cursor round-trips and is opaque base64url', () => {
  const c: LedgerCursor = { gen: GEN, section: 'context_events', n: 2, pages: 3 };
  const s = encodeCursor(c);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCursor(s), c);
});

test('decodeCursor refuses anything it did not produce', () => {
  const enc = (t: string) => Buffer.from(t, 'utf8').toString('base64url');
  const good = encodeCursor({ gen: GEN, section: 'events', n: 0, pages: 1 });
  for (const [why, raw] of [
    ['empty', ''],
    ['not base64url', 'abc+/='],
    ['too long', 'A'.repeat(129)],
    ['padded spelling', good + '='],
    ['unknown section', enc(`${GEN}.tools.0.1`)],
    ['bad gen', enc(`2026101T160153Z-1a2b3c4d.events.0.1`)],
    ['gen without the hex suffix', enc(`${STAMP}.events.0.1`)],
    ['gen with uppercase hex', enc(`${STAMP}-1A2B3C4D.events.0.1`)],
    ['gen with a short suffix', enc(`${STAMP}-1a2b3c4.events.0.1`)],
    ['key injection in gen', enc(`${GEN}:x.events.0.1`)],
    ['key injection in section', enc(`${GEN}.events:*.0.1`)],
    ['negative page', enc(`${GEN}.events.-1.2`)],
    ['leading zero', enc(`${GEN}.events.01.2`)],
    ['page past the end', enc(`${GEN}.events.2.2`)],
    ['zero pages', enc(`${GEN}.events.0.0`)],
    ['pages over the ceiling', enc(`${GEN}.events.0.${MAX_PAGES + 1}`)],
    ['trailing junk', enc(`${GEN}.events.0.1.x`)],
    ['newline', enc(`${GEN}.events.0.1\n`)],
  ] as Array<[string, string]>) {
    assert.equal(decodeCursor(raw), null, why);
  }
});

test('pageKey is the spec layout', () => {
  assert.equal(pageKey(GEN, 'fleet_events', 4), `drift:ledger:v4:${GEN}:fleet_events:4`);
});

const STAT = {
  tools_observed_drifting: 10, total_contract_drifts_observed: 20, servers: 5, safety_relevant: 2,
  independent: {
    tools_observed_drifting: 8, servers: 4, safety_relevant: 1,
    fleet_changes: 1, fleet_tools: 3, fleet_servers: 2, context_fleet_changes: 0, context_fleet_surfaces: 0,
  },
};
const index = (over: Record<string, unknown> = {}) => ({
  schema: LEDGER_INDEX_SCHEMA,
  gen: GEN,
  generated_at: AT,
  ledger_schema: 'mcpindex.drift.ledger/3',
  framing: 'observed',
  stat: STAT,
  digest: 'sha256:abc',
  pages: { events: 34, context_events: 3, fleet_events: 2 },
  counts: { events: 33236, context_events: 2494, fleet_events: 66, servers: 3000 },
  ...over,
});

test('parseLedgerIndex accepts the spec shape, as a string or an object', () => {
  const i = parseLedgerIndex(JSON.stringify(index()), NOW);
  assert.ok(i);
  assert.equal(i.gen, GEN);
  assert.deepEqual(i.pages, { events: 34, context_events: 3, fleet_events: 2 });
  assert.equal(i.counts.events, 33236);
  assert.equal(i.framing, 'observed');
  assert.equal(i.stat.tools_observed_drifting, 10);
  assert.equal(i.stat.independent?.fleet_changes, 1);
  assert.ok(parseLedgerIndex(index(), NOW));
  const v2 = parseLedgerIndex(index({ ledger_schema: 'mcpindex.drift.ledger/2' }), NOW);
  assert.equal(v2?.stat.independent, undefined, 'no twin on a /2 ledger');
  const broken = parseLedgerIndex(index({ stat: { ...STAT, independent: { ...STAT.independent, servers: 99 } } }), NOW);
  assert.ok(broken);
  assert.equal(broken.stat.independent, undefined, 'a twin that breaks an invariant is dropped, as /3 did');
});

test('parseLedgerIndex accepts a generation kept across unchanged hours (gen older than generated_at)', () => {
  // The drain re-SETs the index each hour with a fresh generated_at and keeps gen while rows match.
  const i = parseLedgerIndex(index({ gen: '20261014T110000Z-1a2b3c4d' }), NOW);
  assert.ok(i);
  assert.equal(i.gen, '20261014T110000Z-1a2b3c4d');
  assert.equal(i.generated_at, AT);
});

test('parseLedgerIndex refuses missing, malformed, stale or inconsistent', () => {
  for (const [why, raw] of [
    ['null', null],
    ['not json', '{'],
    ['wrong schema', index({ schema: 'mcpindex.drift.ledger-index/2' })],
    ['gen newer than generated_at', index({ gen: '20261014T160154Z-1a2b3c4d' })],
    ['gen without the suffix', index({ gen: STAMP })],
    ['gen not a gen', index({ gen: 'x:y' })],
    ['stale', index({ generated_at: '2026-10-14T13:00:00Z', gen: '20261014T130000Z-1a2b3c4d' })],
    ['in the future', index({ generated_at: '2026-10-14T18:00:00Z', gen: '20261014T180000Z-1a2b3c4d' })],
    ['unknown ledger_schema', index({ ledger_schema: 'mcpindex.drift.ledger/9' })],
    ['no stat', index({ stat: undefined })],
    ['a section missing', index({ pages: { events: 1, context_events: 1 } })],
    ['negative pages', index({ pages: { events: -1, context_events: 1, fleet_events: 1 } })],
    ['pages over the ceiling', index({ pages: { events: MAX_PAGES + 1, context_events: 1, fleet_events: 1 } })],
    ['non-integer count', index({ counts: { events: 1.5 } })],
    ['odd count key', index({ counts: { 'ev ents': 1 } })],
    ['no digest', index({ digest: 7 })],
  ] as Array<[string, unknown]>) {
    assert.equal(parseLedgerIndex(raw, NOW), null, why);
  }
  assert.equal(parseLedgerIndex(index({ framing: 'x'.repeat(281) }), NOW)?.framing, '', 'oversized framing is blanked, as the summary does');
  assert.equal(parseLedgerIndex(index({ framing: 7 }), NOW)?.framing, '', 'so is a non-string one');
  // Exactly at the age bound is still fresh; one ms past it is not.
  assert.ok(parseLedgerIndex(index(), Date.parse(AT) + SUMMARY_MAX_AGE_MS));
  assert.equal(parseLedgerIndex(index(), Date.parse(AT) + SUMMARY_MAX_AGE_MS + 1), null);
});

const FP = 'a'.repeat(32);
const event = (over: Record<string, unknown> = {}) => ({
  tool_fp: 'b'.repeat(32), server_fp: FP, sources: 1, safety_relevant: false,
  last_seen: '2026-10-14T15:00:00Z', change_kinds: ['added-required-param'], ...over,
});
const fleet = (over: Record<string, unknown> = {}) => ({
  plane: 'tool', publisher_fp: 'c'.repeat(32), day: '2026-10-14', change_kinds: ['added-optional-param'],
  safety_relevant: false, servers: 10, tools: 1,
  members: [{ server_fp: FP, page_tools: 1, last_seen: '2026-10-14T15:00:00Z', safety_relevant: false, toolset_replaced: false }],
  ...over,
});
const page = (section: string, items: unknown[], over: Record<string, unknown> = {}) => ({
  schema: LEDGER_PAGE_SCHEMA, gen: GEN, section, n: 0, items, ...over,
});

test('parseLedgerPage drops a hostile event row the way /3 did and keeps the rest', () => {
  const items = parseLedgerPage(page('events', [event(), { tool_fp: 'zz' }, 'x', event({ server_fp: 'bad' })]), {
    gen: GEN, section: 'events', n: 0,
  });
  assert.ok(items);
  assert.equal(items.length, 2);
  assert.equal((items[1] as { server_fp: string }).server_fp, '', 'invalid server_fp blanked, as /3 did');
});

test('parseLedgerPage drops context rows with no valid server or kinds', () => {
  const ok = { server_fp: FP, sources: 1, safety_relevant: false, last_seen: '2026-10-14T15:00:00Z', change_kinds: ['instructions-changed'] };
  const items = parseLedgerPage(page('context_events', [ok, { ...ok, server_fp: 'x' }, { ...ok, change_kinds: ['type-changed'] }]), {
    gen: GEN, section: 'context_events', n: 0,
  });
  assert.equal(items?.length, 1);
});

test('parseLedgerPage rejects a fleet page with any malformed row (fail closed, as /3)', () => {
  const want = { gen: GEN, section: 'fleet_events' as const, n: 0 };
  assert.equal(parseLedgerPage(page('fleet_events', [fleet()]), want)?.length, 1);
  assert.equal(parseLedgerPage(page('fleet_events', [fleet(), fleet({ members: 'x' })]), want), null);
  assert.equal(parseLedgerPage(page('fleet_events', []), want), null, 'a fleet page holds at least one row');
});

test('parseLedgerPage refuses a page that is not the one asked for', () => {
  const want = { gen: GEN, section: 'events' as const, n: 0 };
  assert.equal(parseLedgerPage(page('events', [], { gen: '20261014T150000Z-1a2b3c4d' }), want), null);
  assert.equal(parseLedgerPage(page('context_events', []), want), null);
  assert.equal(parseLedgerPage(page('events', [], { n: 1 }), want), null);
  assert.equal(parseLedgerPage(page('events', [], { schema: 'x' }), want), null);
  assert.equal(parseLedgerPage(page('events', Array.from({ length: 1001 }, () => event())), want), null, 'row cap');
  assert.deepEqual(parseLedgerPage(JSON.stringify(page('events', [])), want), [], 'string form');
});

// walkLedgerSection: the client the indexable build uses.
function api(pagesBySection: Record<string, unknown[][]>, opts: { generation?: (n: number) => string; status?: (n: number) => number } = {}) {
  const urls: string[] = [];
  const f = (async (input: URL) => {
    const u = new URL(input);
    urls.push(u.search);
    const cur = u.searchParams.get('cursor');
    const c = cur ? decodeCursor(cur) : null;
    const section = c?.section ?? u.searchParams.get('section') ?? 'events';
    const n = c?.n ?? 0;
    const status = opts.status?.(urls.length) ?? 200;
    if (status !== 200) return new Response('{}', { status, headers: { 'retry-after': '1' } });
    const all = pagesBySection[section];
    return Response.json({
      schema: LEDGER_SCHEMA_V4, generated_at: AT, generation: opts.generation?.(n) ?? GEN, ledger_schema: 'mcpindex.drift.ledger/3',
      counts: { [section]: all.flat().length },
      section, page: n, pages: all.length, items: all[n] ?? [],
      next_cursor: n + 1 < all.length ? encodeCursor({ gen: GEN, section: section as 'events', n: n + 1, pages: all.length }) : null,
    });
  }) as unknown as typeof fetch;
  return { f, urls };
}

test('walkLedgerSection follows next_cursor to the last page', async () => {
  const { f, urls } = api({ events: [[1, 2], [3], [4]] });
  const w = await walkLedgerSection('https://x.test/api/v1/ledger', 'events', f, async () => {});
  assert.deepEqual(w.items, [1, 2, 3, 4]);
  assert.equal(w.generation, GEN);
  assert.equal(w.ledger_schema, 'mcpindex.drift.ledger/3');
  assert.equal(urls.length, 3);
  assert.equal(urls[0], '?section=events');
  assert.match(urls[1], /^\?cursor=/);
});

test('walkLedgerSection handles an empty section', async () => {
  const { f } = api({ context_events: [] });
  const w = await walkLedgerSection('https://x.test/api/v1/ledger', 'context_events', f, async () => {});
  assert.deepEqual(w.items, []);
});

test('walkLedgerSection waits out a 429 and refuses a generation change mid-walk', async () => {
  const slept: number[] = [];
  const limited = api({ events: [[1], [2]] }, { status: (call) => (call === 2 ? 429 : 200) });
  const w = await walkLedgerSection('https://x.test/l', 'events', limited.f, async (ms) => { slept.push(ms); });
  assert.deepEqual(w.items, [1, 2]);
  assert.deepEqual(slept, [1000]);
  const moved = api({ events: [[1], [2]] }, { generation: (n) => (n === 0 ? GEN : '20261014T170153Z-1a2b3c4d') });
  await assert.rejects(walkLedgerSection('https://x.test/l', 'events', moved.f, async () => {}), LedgerWalkError);
  const gone = api({ events: [[1], [2]] }, { status: (call) => (call === 2 ? 410 : 200) });
  await assert.rejects(walkLedgerSection('https://x.test/l', 'events', gone.f, async () => {}), /HTTP 410/);
});
