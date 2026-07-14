// Cross-repo receipt round-trip (the highest-risk seam from the coverage analysis): the web ingest
// must accept a receipt in the EXACT shape the trust engine emits, store it, and read it back.
// TRUST_RECEIPT below was generated verbatim from mcpindex-trust's build_receipt_wire (the emitter's
// real output). This test catches WEB-SIDE drift (if the web ReceiptSchema stops accepting the trust
// shape, the safeParse test reds) and verifies the ingest→store→read path.
//
// COVERAGE LIMIT (do not over-claim): TRUST_RECEIPT is a FROZEN hand-copied snapshot. It is NOT an
// executable cross-language guard — if the trust emitter changes the receipt shape, this fixture goes
// stale silently (web CI has no trust checkout to regenerate it). smoke_cloud_contract does NOT cover
// receipts (it guards the DRIFT pipeline: deploy/cloud/lib/validate.ts). The receipt shape's only live
// cross-language tripwire would be a trust-side smoke running this schema against build_receipt_wire.
// RE-SYNC this TRUST_RECEIPT literal whenever mcpindex-trust build_receipt_wire changes.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute, FIX, storingRedis } from './_harness';
import { ReceiptBatchSchema, __setReceiptIngestRedisForTest } from '../../lib/receiptIngest';
import { GET as receiptsGet, POST as receiptsPost } from '../../app/api/v1/receipts/route';

// Verbatim from `mcpindex-trust` build_receipt_wire() — the authentic emitter wire shape.
const TRUST_RECEIPT = {
  receipt_id: 'rcpt_feedface',
  tool_hash: 'sha256:' + 'b'.repeat(64),
  verdict_at_call: 'REVIEW',
  action_classification: {
    action_types: ['read'], effective_action_type: 'read',
    resource: { kind: 'data', pattern: 'single-arg', scope_hint: 'narrow' },
    side_effect_class: 'none', reversibility: 'reversible', egress: 'none',
    autonomy_ceiling: 'discovery', autonomy_ceiling_basis: 'static',
    known_risk_notes: [],
    evidence: [{ ref_type: 'schema_flag', ref_id: 'domain.data' }, { ref_type: 'schema_flag', ref_id: 'action.read' }],
  },
  run_context: { autonomy_level: 'reversible', task_intent_class: 'read-summarize', human_in_loop: false, framework: 'langchain' },
  outcome: { executed: true, status: 'ok', side_effect_observed: 'none', reverted: false, latency_bucket: '1-2s' },
  justified: 'unclear',
  ts: '2026-06-21T12:00:00+00:00',
};

beforeEach(() => { __setReceiptIngestRedisForTest(storingRedis()); });
afterEach(() => { __setReceiptIngestRedisForTest(undefined); });

test('the trust emitter shape validates as a web ReceiptBatch (cross-language contract)', () => {
  const parsed = ReceiptBatchSchema.safeParse({ v: 1, receipts: [TRUST_RECEIPT], install_id: FIX.ID32_OK });
  assert.ok(parsed.success, 'web ReceiptSchema rejected the trust emitter output: ' + JSON.stringify(parsed.error?.issues?.[0]));
});

test('round-trip: POST a trust-emitted receipt → 204, then GET reads it back', async () => {
  const redis = storingRedis();
  __setReceiptIngestRedisForTest(redis); // same instance across POST+GET so writes are visible to reads

  const post = await callRoute(receiptsPost, '/api/v1/receipts', {
    method: 'POST', body: { v: 1, receipts: [TRUST_RECEIPT], install_id: FIX.ID32_OK }, ip: '1.1.1.1',
  });
  assert.equal(post.status, 204);

  const get = await callRoute(receiptsGet, '/api/v1/receipts', { query: { id: FIX.ID32_OK } });
  assert.equal(get.status, 200);
  const b = get.json() as any;
  assert.ok(b.count >= 1, `expected >=1 receipt read back, got ${b.count}`);
  assert.ok(Array.isArray(b.receipts) && b.receipts.length >= 1);
  // content fidelity, not just cardinality: the trust receipt's fields must survive ingest→store→read
  // (compact index stores {rid, th, v, a, ts}). Catches a stub/corrupted store that still bumps count.
  const rec = b.receipts[0];
  assert.equal(rec.rid, 'rcpt_feedface');
  assert.equal(rec.v, 'REVIEW'); // verdict_at_call
  assert.equal(rec.a, 'read'); // effective action class
});

test('round-trip: a receipt for a DIFFERENT install is not read back (install isolation)', async () => {
  const redis = storingRedis();
  __setReceiptIngestRedisForTest(redis);
  await callRoute(receiptsPost, '/api/v1/receipts', { method: 'POST', body: { v: 1, receipts: [TRUST_RECEIPT], install_id: FIX.ID32_OK }, ip: '1.1.1.1' });
  const other = 'ffffffffffffffffffffffffffffffff';
  const get = await callRoute(receiptsGet, '/api/v1/receipts', { query: { id: other } });
  assert.equal(get.status, 200);
  assert.equal((get.json() as any).count, 0);
});
