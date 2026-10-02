import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { serverFp } from './driftFingerprint';
import { LEDGER_SCHEMA, LEDGER_SCHEMA_V3 } from './ledger';
import {
  coerceIndexable,
  computeIndexable,
  INDEXABLE_KEEP_RATIO,
  INDEXABLE_SCHEMA,
  indexableCountAcceptable,
  ledgerAnswersIndexableCriterion,
} from './indexable';

const DOC = {
  schema: INDEXABLE_SCHEMA,
  generated_at: '2026-10-02T20:00:00Z',
  ledger_generated_at: '2026-10-02T19:00:00Z',
  criterion: 'test',
  servers: ['com.example/a'],
};

test('compute: a tool event or a context event qualifies; nothing else does', () => {
  const out = computeIndexable(
    ['z.example/tool', 'a.example/ctx', 'm.example/none'],
    [{ server_fp: serverFp('z.example/tool') }],
    [{ server_fp: serverFp('a.example/ctx') }],
  );
  assert.deepEqual(out, ['a.example/ctx', 'z.example/tool']);
});

test('compute: duplicate registry names come out once', () => {
  const fp = serverFp('com.example/a');
  assert.deepEqual(computeIndexable(['com.example/a', 'com.example/a'], [{ server_fp: fp }], []), ['com.example/a']);
});

test('coerce: well-formed doc survives', () => {
  assert.deepEqual(coerceIndexable(DOC)?.servers, ['com.example/a']);
});

test('coerce: wrong schema, empty set and junk all read as NO artifact (everything stays indexable)', () => {
  assert.equal(coerceIndexable({ ...DOC, schema: 'mcpindex.indexable/0' }), null);
  assert.equal(coerceIndexable({ ...DOC, servers: [] }), null);
  assert.equal(coerceIndexable({ ...DOC, servers: [1, ''] }), null);
  assert.equal(coerceIndexable(null), null);
  assert.equal(coerceIndexable([]), null);
});

test('only a /3 ledger can select the set', () => {
  assert.equal(ledgerAnswersIndexableCriterion(LEDGER_SCHEMA_V3), true);
  // /2 lists fleet-collapsed tools inside events, so a fleet-only server would qualify.
  assert.equal(ledgerAnswersIndexableCriterion(LEDGER_SCHEMA), false);
  assert.equal(ledgerAnswersIndexableCriterion('mcpindex.drift.ledger/9'), false);
});

test('a new count may not shrink below half or grow past double', () => {
  const prev = 1000;
  assert.equal(indexableCountAcceptable(prev, prev), true);
  assert.equal(indexableCountAcceptable(prev * INDEXABLE_KEEP_RATIO, prev), true);
  assert.equal(indexableCountAcceptable(prev * INDEXABLE_KEEP_RATIO - 1, prev), false);
  assert.equal(indexableCountAcceptable(prev / INDEXABLE_KEEP_RATIO, prev), true);
  assert.equal(indexableCountAcceptable(prev / INDEXABLE_KEEP_RATIO + 1, prev), false);
  assert.equal(indexableCountAcceptable(0, prev), false);
  assert.equal(indexableCountAcceptable(10, null), true);
});

test('committed artifact parses and is sorted', async () => {
  const raw = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'indexable-servers.json'), 'utf8'));
  const doc = coerceIndexable(raw);
  assert.ok(doc, 'data/indexable-servers.json must coerce');
  assert.deepEqual([...doc.servers], [...doc.servers].sort());
});
