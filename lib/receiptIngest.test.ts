import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeekKey, recordReceiptBatch, __setReceiptIngestRedisForTest } from './receiptIngest';

test('isoWeekKey: ISO-8601 week boundaries (UTC)', () => {
  // Mid-year, plain case.
  assert.equal(isoWeekKey(new Date('2026-07-18T12:00:00Z')), '2026-W29');
  // Jan 1 on a Thursday belongs to W01 of its own year.
  assert.equal(isoWeekKey(new Date('2026-01-01T00:00:00Z')), '2026-W01');
  // A late-December Monday can belong to the NEXT ISO year.
  assert.equal(isoWeekKey(new Date('2024-12-30T23:59:59Z')), '2025-W01');
  // A Jan 1 Friday can belong to the PREVIOUS ISO year's W53.
  assert.equal(isoWeekKey(new Date('2021-01-01T00:00:00Z')), '2020-W53');
});

test('recordReceiptBatch folds the install into cumulative AND weekly HLL keys', async () => {
  const pfadds: Array<[string, string]> = [];
  const expires: string[] = [];
  type Pipe = {
    exec: () => Promise<unknown[]>;
    pfadd: (k: string, v: string) => Pipe;
    expire: (k: string, ttl: number) => Pipe;
    xadd: (...a: unknown[]) => Pipe;
    lpush: (...a: unknown[]) => Pipe;
    ltrim: (...a: unknown[]) => Pipe;
  };
  const p: Pipe = {
    exec: async () => [],
    pfadd: (k, v) => { pfadds.push([k, v]); return p; },
    expire: (k) => { expires.push(k); return p; },
    xadd: () => p,
    lpush: () => p,
    ltrim: () => p,
  };
  const fake = { pipeline: () => p } as unknown as Parameters<typeof __setReceiptIngestRedisForTest>[0];
  __setReceiptIngestRedisForTest(fake);
  try {
    await recordReceiptBatch([], 'a'.repeat(32), new Date('2026-07-18T12:00:00Z'));
  } finally {
    __setReceiptIngestRedisForTest(undefined);
  }
  const keys = pfadds.map(([k]) => k);
  assert.ok(keys.includes('receipts:installs'), 'cumulative HLL key missing');
  assert.ok(keys.includes('receipts:installs:2026-W29'), 'weekly WAG proxy key missing');
  assert.ok(pfadds.every(([, v]) => v === 'a'.repeat(32)), 'keys must fold the same install_id');
  // The weekly key is TTL'd so proxy keys age out; the cumulative key must NOT be expired.
  assert.ok(expires.includes('receipts:installs:2026-W29'), 'weekly key must get a TTL');
  assert.ok(!expires.includes('receipts:installs'), 'cumulative key must never get a TTL');
});
