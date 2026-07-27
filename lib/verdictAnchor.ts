import 'server-only';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Verdict-corpus anchors: OpenTimestamps proofs over the published verdict store.
 *
 * WHAT AN ANCHOR PROVES. That this exact set of verdicts existed no later than the
 * attested Bitcoin block. It does NOT prove the verdicts are correct, and it does NOT
 * reach back before the first anchor — the chain is real going forward, never
 * retroactive. Any copy that implies otherwise is the same overclaim that put
 * "Verdict history is anchored to Bitcoin via OpenTimestamps" on every server page
 * while nothing anchored the published verdicts at all.
 *
 * PENDING IS NOT CONFIRMED. `ots stamp` returns immediately with a proof the calendars
 * have accepted but Bitcoin has not yet published. Only an entry carrying at least one
 * block height may be described as Bitcoin-anchored. `anchorState()` is the single
 * place that distinction is made, so no surface can quietly blur it.
 *
 * The ledger is produced on the VM and published by PR (scripts/publish_verdict_anchors.sh
 * in mcpindex-trust); this module only reads the committed artifact, matching the
 * verdicts.json pattern — server pages are statically prerendered, so a runtime lookup
 * would add a failure mode to every render.
 */

export type AnchorEntry = {
  seq: number;
  root: string;
  prev_root: string | null;
  chain_root: string;
  verdict_count: number;
  stamped_at: string;
  proof: string;
  bitcoin?: { block_heights?: number[]; block_hashes?: string[]; upgraded_at?: string };
};

export type AnchorState =
  /** No ledger published yet. The anchoring claim is FORBIDDEN. */
  | { kind: 'none' }
  /** Proofs exist but no Bitcoin attestation yet. Say "submitted", never "anchored". */
  | { kind: 'pending'; latest: AnchorEntry; total: number }
  /** At least one entry carries a block height. The anchoring claim is TRUE. */
  | { kind: 'confirmed'; latest: AnchorEntry; latestConfirmed: AnchorEntry; total: number; confirmed: number };

const LEDGER_PATH = path.join(process.cwd(), 'data', 'verdict-anchors.json');

function isConfirmed(e: AnchorEntry): boolean {
  return (e.bitcoin?.block_heights?.length ?? 0) > 0;
}

/**
 * Read the ledger. A missing file is the legitimate pre-genesis state and yields [];
 * a MALFORMED file throws.
 *
 * That asymmetry is deliberate. "No anchors yet" is a state the site must render
 * honestly. "The anchor ledger is unparseable" must fail the build, because the
 * alternative is a page that silently degrades to claiming less — or, worse, a caller
 * that treats an empty parse as "no anchors" and hides a corrupted artifact.
 */
export function loadAnchorLedger(file: string = LEDGER_PATH): AnchorEntry[] {
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    schema_version?: string;
    anchors?: AnchorEntry[];
  };
  if (raw.schema_version !== '1') {
    throw new Error(`verdict-anchors.json: unsupported schema_version ${raw.schema_version}`);
  }
  if (!Array.isArray(raw.anchors)) {
    throw new Error('verdict-anchors.json: anchors is not an array');
  }
  return raw.anchors;
}

/**
 * Re-derive the chain links this side of the wire.
 *
 * The VM verifies before publishing, so this is a second, independent check of the same
 * property — worth its cost because the failure it catches (a truncated or hand-edited
 * ledger) would otherwise be found by a reader recomputing our arithmetic, which is the
 * single worst way to discover it. Hash re-computation is deliberately NOT done here:
 * chain_root folds a digest, and recomputing it in TS would mean a second canonical-JSON
 * implementation to keep byte-identical with Python. Structural checks only; the .ots
 * proof is what a reader verifies cryptographically.
 */
export function verifyAnchorLedgerShape(ledger: AnchorEntry[]): void {
  let prev: AnchorEntry | null = null;
  for (const [i, e] of ledger.entries()) {
    const wantSeq = prev ? prev.seq + 1 : 1;
    if (e.seq !== wantSeq) throw new Error(`anchor ${i}: seq ${e.seq} != ${wantSeq}`);
    const wantPrev = prev ? prev.root : null;
    if (e.prev_root !== wantPrev) throw new Error(`anchor ${i}: prev_root mismatch`);
    if (e.proof !== `anchors/${e.chain_root.replace(/^sha256:/, '')}.ots`) {
      throw new Error(`anchor ${i}: proof path does not match chain_root`);
    }
    prev = e;
  }
}

/**
 * The one place "is the anchoring claim true right now?" is decided.
 *
 * Every surface that mentions Bitcoin anchoring must branch on this rather than
 * hardcoding a sentence, so the copy cannot outrun the evidence again.
 */
export function anchorState(ledger: AnchorEntry[] = loadAnchorLedger()): AnchorState {
  if (ledger.length === 0) return { kind: 'none' };
  verifyAnchorLedgerShape(ledger);
  const latest = ledger[ledger.length - 1];
  const confirmedEntries = ledger.filter(isConfirmed);
  if (confirmedEntries.length === 0) {
    return { kind: 'pending', latest, total: ledger.length };
  }
  return {
    kind: 'confirmed',
    latest,
    latestConfirmed: confirmedEntries[confirmedEntries.length - 1],
    total: ledger.length,
    confirmed: confirmedEntries.length,
  };
}

/**
 * One sentence describing history integrity, true for the CURRENT state.
 *
 * Returned rather than hardcoded per page: nine surfaces asserted Bitcoin anchoring
 * independently, and correcting them meant finding all nine by hand. One function means
 * one edit when the state changes, and no surface can drift from the evidence.
 */
export function anchorClaim(state: AnchorState = anchorState()): string {
  switch (state.kind) {
    case 'none':
      return 'Verdict history is hash-chained. Bitcoin anchoring via OpenTimestamps is built but no anchor has been published yet.';
    case 'pending':
      return `Verdict history is hash-chained, and the chain root is submitted to OpenTimestamps (${state.total} anchor${state.total === 1 ? '' : 's'}); the Bitcoin attestation is not yet confirmed.`;
    case 'confirmed': {
      const h = state.latestConfirmed.bitcoin?.block_heights?.[0];
      return `Verdict history is hash-chained and anchored to Bitcoin via OpenTimestamps${h ? ` (latest confirmed at block ${h.toLocaleString('en-US')})` : ''}.`;
    }
  }
}
