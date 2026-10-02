import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { serverFp } from './driftFingerprint';
import { coerceIndexable, computeIndexable, INDEXABLE_SCHEMA } from './indexable';

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

test('committed artifact parses and is sorted', async () => {
  const raw = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'indexable-servers.json'), 'utf8'));
  const doc = coerceIndexable(raw);
  assert.ok(doc, 'data/indexable-servers.json must coerce');
  assert.deepEqual([...doc.servers], [...doc.servers].sort());
});
