import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateServerDrift } from './serverDrift';
import type { LedgerEvent } from './ledger';

const FP_A = 'a'.repeat(32);
const FP_B = 'b'.repeat(32);

function ev(over: Partial<LedgerEvent>): LedgerEvent {
  return {
    tool_fp: '0'.repeat(32),
    server_fp: FP_A,
    sources: 1,
    safety_relevant: false,
    last_seen: '2026-06-10T04:00:00Z',
    change_kinds: [],
    ...over,
  };
}

test('aggregates only this server, unions+sorts kinds, takes the latest last_seen', () => {
  const events: LedgerEvent[] = [
    ev({ tool_fp: '1'.repeat(32), change_kinds: ['type-changed'], last_seen: '2026-06-10T04:00:00Z' }),
    ev({ tool_fp: '2'.repeat(32), change_kinds: ['added-required-param', 'type-changed'], last_seen: '2026-06-10T06:00:00Z', safety_relevant: true }),
    ev({ tool_fp: '3'.repeat(32), server_fp: FP_B, change_kinds: ['removed-param'] }), // other server -> excluded
  ];
  const out = aggregateServerDrift(events, FP_A, '2026-06-10T07:00:00Z');
  assert.equal(out.changes, 2);
  assert.deepEqual(out.kinds, ['added-required-param', 'type-changed']);
  assert.equal(out.lastSeen, '2026-06-10T06:00:00Z');
  assert.equal(out.safetyRelevant, true);
  assert.equal(out.ledgerGeneratedAt, '2026-06-10T07:00:00Z');
});

test('a server with no matching events returns changes:0 (honest none, not null)', () => {
  const out = aggregateServerDrift([ev({ server_fp: FP_B })], FP_A, '2026-06-10T07:00:00Z');
  assert.equal(out.changes, 0);
  assert.equal(out.lastSeen, null);
  assert.deepEqual(out.kinds, []);
  assert.equal(out.safetyRelevant, false);
});
