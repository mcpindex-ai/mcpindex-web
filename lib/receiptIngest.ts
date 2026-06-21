// Action-receipt ingest (Phase D) — the minimal server side of the receipt calibration plane.
//
// Two jobs, mirroring driftIngest.ts 1:1:
//
// (1) STRICTLY validate the closed ActionReceipt shape — this is the server-side privacy
//     BACKSTOP. The PUBLIC client emitter (tooling.cse.receipt_emit.build_receipt_wire) builds
//     the wire dict by construction from closed enums + hash-shaped ids only; this schema
//     re-asserts that on the wire, so even a future client bug cannot land a raw tool string,
//     arg, result, URL, or any free text here. Every object level is `.strict()` (rejects ANY
//     unknown key — a free-text key is exactly the PII channel the closed vocab exists to deny);
//     every enum is the EXACT vocab from the trust files (receipt_vocab.py + action_class.py);
//     every id/hash/ts is `.regex(...)`; arrays are length-bounded to the Pydantic max_lengths.
//     The envelope carries install_id (one per SDK process), which is NOT a receipt field — it
//     stays out of the per-receipt schema (the receipt stays a pure action record).
//
// (2) For each validated receipt: XADD it to the `receipts:stream` for the mini32 drain
//     (scripts/drift_corpus_drain.py, parse_receipt_entries -> drain_receipts), which writes the
//     Supabase `receipts` corpus (migration 0005). Fields are `d` (receipt JSON) / `install_id`
//     (envelope id) / `auth` ('1'|'0' bearer stamp) — matched EXACTLY to the drain's reader.
//     Also PFADD the install_id into `receipts:installs` for O(1)-space distinct-install
//     cardinality. STORE-ONLY: no aggregated/corroboration signal is computed or served here
//     (publishing a multi-party signal is a gated one-way door handled elsewhere). Best-effort,
//     fail-OPEN on a Redis hiccup — same resilience as recordDriftBatch.

import { z } from 'zod';
import { Redis } from '@upstash/redis';

// --- id / hash / ts / install patterns — byte-for-byte from tooling.cse.receipt_vocab + the
// --- action_class Pydantic patterns. (Anchored to the WHOLE string; the Python `re` patterns
// --- are likewise full-match in their Field/StrEnum usage.)
const RECEIPT_ID = /^rcpt_[a-z0-9]{8,40}$/; // receipt_vocab.ID_RE
const TOOL_HASH = /^sha256:[a-f0-9]{64}$/; // receipt_vocab.HASH_RE
const TS = /^\d{4}-\d{2}-\d{2}T[0-9:.+\-Z]{1,32}$/; // receipt_vocab.TS_RE (ISO-shape, bounded)
const INSTALL_ID = /^[0-9a-f]{32}$/; // envelope-level; same 32-hex install identity as drift
const RESOURCE_KIND = /^[a-z0-9_]+$/; // action_class.Resource.kind (max_length 32)
const REF_ID = /^[a-z0-9_.:-]+$/; // action_class.EvidenceRef.ref_id (max_length 64)

export const MAX_BATCH = 256; // mirrors the client ring-buffer cap (receipt_emit._MAX_BUFFER)
// M2 corpus stream: each validated receipt is enqueued for the mini32 drain, which builds the
// Supabase `receipts` corpus. Capped via xadd MAXLEN so a down drain can't grow it unbounded.
const STREAM_KEY = 'receipts:stream';
const STREAM_MAXLEN = 100_000;
// Distinct-install HyperLogLog (O(1) space): the publish-OFF cardinality metric.
const INSTALLS_HLL_KEY = 'receipts:installs';
// Hard ceiling on how long the (best-effort) write may hold the ingest response.
const EXEC_TIMEOUT_MS = 2_000;

// --- enums — EXACT values from tooling.cse.action_class (action_classification block) ---

const ActionType = z.enum([
  'read',
  'list',
  'search',
  'write',
  'update',
  'delete',
  'send',
  'execute',
  'auth',
  'admin',
  'unknown',
]);
const SideEffectClass = z.enum(['none', 'local-write', 'outbound', 'destructive']);
const Reversibility = z.enum(['reversible', 'hard-to-reverse', 'irreversible']);
const Egress = z.enum(['none', 'internal', 'external']);
const ScopeHint = z.enum(['narrow', 'broad', 'unbounded']);
const PatternShape = z.enum(['literal', 'single-arg', 'glob', 'wildcard', 'templated']);
const AutonomyCeiling = z.enum([
  'discovery',
  'reversible',
  'needs-approval',
  'never-unattended',
]);
const NoteClass = z.enum([
  'destructive_no_undo_path',
  'annotation_contradicts_probe',
  'known_cve',
  'observed_exfil',
  'scope_escape',
]);
const Severity = z.enum(['low', 'medium', 'high']);
const EvidenceRefType = z.enum(['probe', 'schema_flag', 'corpus_cell', 'cve']);

const ResourceSchema = z
  .object({
    kind: z.string().max(32).regex(RESOURCE_KIND),
    pattern: PatternShape,
    scope_hint: ScopeHint,
  })
  .strict();

const EvidenceRefSchema = z
  .object({
    ref_type: EvidenceRefType,
    ref_id: z.string().max(64).regex(REF_ID),
  })
  .strict();

const KnownRiskNoteSchema = z
  .object({
    note_class: NoteClass,
    severity: Severity,
    source: EvidenceRefSchema,
    provenance: z.enum(['curated', 'derived']),
  })
  .strict();

const ActionClassificationSchema = z
  .object({
    action_types: z.array(ActionType).min(1).max(8),
    effective_action_type: ActionType,
    resource: ResourceSchema,
    side_effect_class: SideEffectClass,
    reversibility: Reversibility,
    egress: Egress,
    autonomy_ceiling: AutonomyCeiling,
    autonomy_ceiling_basis: z.enum(['static', 'calibrated']),
    known_risk_notes: z.array(KnownRiskNoteSchema).max(16),
    evidence: z.array(EvidenceRefSchema).max(16),
  })
  .strict();

// --- run-context / outcome enums — EXACT values from tooling.cse.receipt_vocab ---

const AutonomyLevel = z.enum(['discovery', 'reversible', 'irreversible']);
const TaskIntentClass = z.enum([
  'read-summarize',
  'search-retrieve',
  'write-update',
  'send-notify',
  'code-execute',
  'admin-ops',
  'payment-ops',
  'other',
]);
const Framework = z.enum([
  'langchain',
  'llamaindex',
  'dspy',
  'mastra',
  'composio',
  'custom',
  'other',
]);
const OutcomeStatus = z.enum(['ok', 'error', 'denied_by_framework', 'rolled_back']);
const SideEffectObserved = z.enum(['none', 'local-write', 'outbound', 'destructive']);
const LatencyBucket = z.enum(['sub-100ms', '100ms-1s', '1-2s', '2-5s', '5s+']);
const CallVerdict = z.enum(['ALLOW', 'REVIEW', 'DENY']);
const Justified = z.enum(['yes', 'no', 'unclear']);

const RunContextSchema = z
  .object({
    autonomy_level: AutonomyLevel,
    task_intent_class: TaskIntentClass,
    human_in_loop: z.boolean(),
    framework: Framework,
  })
  .strict();

const OutcomeSchema = z
  .object({
    executed: z.boolean(),
    status: OutcomeStatus,
    side_effect_observed: SideEffectObserved,
    reverted: z.boolean(),
    latency_bucket: LatencyBucket,
  })
  .strict();

// The closed ActionReceipt — exactly build_receipt_wire's output. install_id is ENVELOPE-level
// and is intentionally ABSENT here (it lives on the batch, not the receipt).
export const ReceiptSchema = z
  .object({
    receipt_id: z.string().regex(RECEIPT_ID),
    tool_hash: z.string().regex(TOOL_HASH),
    verdict_at_call: CallVerdict,
    action_classification: ActionClassificationSchema,
    run_context: RunContextSchema,
    outcome: OutcomeSchema,
    justified: Justified,
    ts: z.string().regex(TS),
  })
  .strict();

// The wire envelope the SDK POSTs: {v:1, receipts:[...], install_id:"<32 hex>"}.
export const ReceiptBatchSchema = z
  .object({
    v: z.literal(1),
    receipts: z.array(ReceiptSchema).min(1).max(MAX_BATCH),
    install_id: z.string().regex(INSTALL_ID),
  })
  .strict();

export type Receipt = z.infer<typeof ReceiptSchema>;
export type ReceiptBatch = z.infer<typeof ReceiptBatchSchema>;

let _redis: Redis | null | undefined;

/** @internal test seam: inject Redis (or null); pass undefined to reset lazy init. */
export function __setReceiptIngestRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  // retries:1 bounds the REST client's default 5-retry exponential backoff — a Redis incident
  // must not stack ~11s of retries onto the ingest response (see EXEC_TIMEOUT_MS below).
  _redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  return _redis;
}

// Enqueue a validated receipt batch for the corpus drain + fold the distinct-install HLL.
// Best-effort, fail-OPEN: any Redis error is swallowed (the caller already 204'd the client).
// STORE-ONLY — XADD + PFADD; no aggregated signal is computed here. The stream fields
// (d / install_id / auth) match drift_corpus_drain.parse_receipt_entries EXACTLY.
export async function recordReceiptBatch(
  receipts: Receipt[],
  installId: string,
  now: Date,
  authedInstalls: ReadonlySet<string> = new Set(),
): Promise<void> {
  const r = redis();
  if (!r) return;
  void now; // signature parity with recordDriftBatch; no per-day counter on this plane
  try {
    const auth = authedInstalls.has(installId) ? '1' : '0';
    const p = r.pipeline();

    // Distinct-install cardinality (publish-OFF metric); O(1) space via HyperLogLog.
    p.pfadd(INSTALLS_HLL_KEY, installId);

    // Corpus enqueue: one stream entry per validated receipt. The drain reads d/install_id/auth.
    for (const rec of receipts) {
      p.xadd(
        STREAM_KEY,
        '*',
        { d: JSON.stringify(rec), install_id: installId, auth },
        { trim: { type: 'MAXLEN', threshold: STREAM_MAXLEN, comparison: '~' } },
      );
    }

    // Bound how long the write can hold the ingest response. The route awaits this before its
    // 204, so a hung Upstash must not stall the request: race the pipeline against a timeout
    // (the pipeline pre-swallows its own late rejection so it can lose harmlessly).
    const exec = p.exec().then(
      () => undefined,
      () => undefined,
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, EXEC_TIMEOUT_MS);
    });
    await Promise.race([exec, timeout]);
    clearTimeout(timer);
  } catch {
    // fail-open: the write is best-effort; never surface a Redis hiccup to the client
  }
}
