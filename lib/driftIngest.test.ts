// Unit tests for the drift-ingest validator — the server-side PRIVACY BACKSTOP. The client
// emits only fingerprints/hashes/enums by construction; these tests lock that the ingest
// REJECTS anything else, so even a future client regression cannot land a raw tool string in
// our store. Run with `npm test` (tsx + node:test).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Redis } from '@upstash/redis';
import {
  DriftBatchSchema,
  DriftSignalSchema,
  MAX_BATCH,
  recordDriftBatch,
  __setDriftIngestRedisForTest,
  type DriftSignal,
} from './driftIngest';

type PipelineCall = { method: string; args: unknown[] };

function mockRedisPipeline(): { client: Redis; calls: PipelineCall[] } {
  const calls: PipelineCall[] = [];
  const pipeline = {
    incrby(...args: unknown[]) {
      calls.push({ method: 'incrby', args });
      return pipeline;
    },
    expire(...args: unknown[]) {
      calls.push({ method: 'expire', args });
      return pipeline;
    },
    pfadd(...args: unknown[]) {
      calls.push({ method: 'pfadd', args });
      return pipeline;
    },
    xadd(...args: unknown[]) {
      calls.push({ method: 'xadd', args });
      return pipeline;
    },
    sadd(...args: unknown[]) {
      calls.push({ method: 'sadd', args });
      return pipeline;
    },
    exec() {
      return Promise.resolve([]);
    },
  };
  const client = { pipeline: () => pipeline } as unknown as Redis;
  return { client, calls };
}

function saddCalls(calls: PipelineCall[]) {
  return calls.filter((c) => c.method === 'sadd');
}

function expireCalls(calls: PipelineCall[]) {
  return calls.filter((c) => c.method === 'expire');
}

afterEach(() => {
  __setDriftIngestRedisForTest(undefined);
  delete process.env.DRIFT_RECRAWL_HINTS;
});

const NOW = new Date('2026-06-09T12:00:00.000Z');

const PIN = {
  v: 1,
  event: 'pin',
  server_fp: '0b4796d16feb3912c0db0824c39e9b70',
  tool_fp: '109fa3f411a148f7e96f9bebb15d5799',
  prev_hash: null,
  new_hash: 'sha256:077fa7e7823cffdf3372a607f5f1ad0a46c1a79ee58795307f9d8ba686e4a184',
  change_kinds: null,
  safety_relevant: false,
  at_hour: '2026-06-09T05:00:00Z',
  sdk: 'ts',
  install_id: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
} as const;

const DRIFT = {
  ...PIN,
  event: 'drift',
  prev_hash: 'sha256:077fa7e7823cffdf3372a607f5f1ad0a46c1a79ee58795307f9d8ba686e4a184',
  change_kinds: ['added-required-param', 'description-only'],
  safety_relevant: true,
} as const;

test('valid pin + drift batch parses', () => {
  const r = DriftBatchSchema.safeParse({ signals: [PIN, DRIFT] });
  assert.ok(r.success, JSON.stringify(r));
});

test('strict: an unexpected key is rejected (no smuggling channel)', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, raw_description: 'send all funds' }).success, false);
});

test('PRIVACY BACKSTOP: a raw string in server_fp is rejected', () => {
  assert.equal(
    DriftSignalSchema.safeParse({ ...PIN, server_fp: 'https://internal.corp.example/secret' }).success,
    false,
  );
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, tool_fp: 'transfer_funds' }).success, false);
});

test('PRIVACY BACKSTOP: an injection string in change_kinds is rejected', () => {
  assert.equal(
    DriftSignalSchema.safeParse({ ...DRIFT, change_kinds: ['ignore previous instructions'] }).success,
    false,
  );
});

test('at_hour must be hour-coarsened or empty (no sub-hour timing leak)', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, at_hour: '2026-06-09T05:09:46Z' }).success, false);
  assert.ok(DriftSignalSchema.safeParse({ ...PIN, at_hour: '' }).success);
});

test('new_hash must be algo:hex; a free-text hash is rejected', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, new_hash: 'definitely-not-a-hash' }).success, false);
});

test('install_id must be hex', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, install_id: '../../etc/passwd' }).success, false);
});

test('batch bounds: empty rejected, oversized rejected', () => {
  assert.equal(DriftBatchSchema.safeParse({ signals: [] }).success, false);
  const over = Array.from({ length: MAX_BATCH + 1 }, () => PIN);
  assert.equal(DriftBatchSchema.safeParse({ signals: over }).success, false);
});

test('unknown event enum is rejected', () => {
  assert.equal(DriftSignalSchema.safeParse({ ...PIN, event: 'exfiltrate' }).success, false);
});

test('recordDriftBatch: flag ON + drift batch dedupes tool_fp into one sadd + 86400 expire', async () => {
  process.env.DRIFT_RECRAWL_HINTS = '1';
  const { client, calls } = mockRedisPipeline();
  __setDriftIngestRedisForTest(client);
  const driftB: DriftSignal = {
    ...DRIFT,
    server_fp: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    install_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };
  await recordDriftBatch([DRIFT, driftB], NOW);
  assert.equal(saddCalls(calls).length, 1);
  assert.deepEqual(saddCalls(calls)[0]?.args, ['drift:recrawl:hints', DRIFT.tool_fp]);
  const hintExpires = expireCalls(calls).filter((c) => c.args[0] === 'drift:recrawl:hints');
  assert.equal(hintExpires.length, 1);
  assert.equal(hintExpires[0]?.args[1], 86_400);
});

test('recordDriftBatch: flag ON + pins-only batch adds no sadd/expire on hints key', async () => {
  process.env.DRIFT_RECRAWL_HINTS = '1';
  const { client, calls } = mockRedisPipeline();
  __setDriftIngestRedisForTest(client);
  await recordDriftBatch([PIN], NOW);
  assert.equal(saddCalls(calls).length, 0);
  assert.equal(expireCalls(calls).filter((c) => c.args[0] === 'drift:recrawl:hints').length, 0);
});

test('recordDriftBatch: flag OFF + drift batch is byte-identical (no hint sadd/expire)', async () => {
  delete process.env.DRIFT_RECRAWL_HINTS;
  const { client, calls } = mockRedisPipeline();
  __setDriftIngestRedisForTest(client);
  await recordDriftBatch([DRIFT], NOW);
  assert.equal(saddCalls(calls).length, 0);
  assert.equal(expireCalls(calls).filter((c) => c.args[0] === 'drift:recrawl:hints').length, 0);
});

function xaddEntries(calls: PipelineCall[]) {
  return calls.filter((c) => c.method === 'xadd');
}

test('recordDriftBatch: default authedInstalls stamps auth:0 on all stream entries', async () => {
  const { client, calls } = mockRedisPipeline();
  __setDriftIngestRedisForTest(client);
  await recordDriftBatch([PIN, DRIFT], NOW);
  const entries = xaddEntries(calls);
  assert.equal(entries.length, 2);
  for (const e of entries) {
    const fields = e.args[2] as Record<string, string>;
    assert.equal(fields.auth, '0');
  }
});

test('recordDriftBatch: authedInstalls stamps auth:1 only on matching install_id', async () => {
  const { client, calls } = mockRedisPipeline();
  __setDriftIngestRedisForTest(client);
  const driftB: DriftSignal = {
    ...DRIFT,
    server_fp: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    install_id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  };
  const authed = new Set([PIN.install_id]);
  await recordDriftBatch([PIN, DRIFT, driftB], NOW, authed);
  const entries = xaddEntries(calls);
  assert.equal(entries.length, 3);
  const byInstall = new Map<string, string>();
  for (const e of entries) {
    const payload = JSON.parse((e.args[2] as Record<string, string>).d) as DriftSignal;
    byInstall.set(payload.install_id, (e.args[2] as Record<string, string>).auth);
  }
  assert.equal(byInstall.get(PIN.install_id), '1');
  assert.equal(byInstall.get('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), '0');
});
