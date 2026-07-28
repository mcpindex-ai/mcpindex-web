import 'server-only';
import { ADVISORY_FLOOR } from './honest-limits';
import { anchorState, type AnchorState } from './verdictAnchor';

/**
 * Machine-readable provenance for anything mcpindex serialises OUT.
 *
 * WHY THIS EXISTS. Four surfaces shipped data to consumers with no statement of where it
 * came from or how far to trust it: `/api/v1/diff`, `/api/v1/recommend` (via
 * lib/recommend), the server-page JSON-LD, and the MCP transport formatters. None of them
 * MISSTATED anything - the failure was omission, which is why it stayed below the line for
 * a while. But the consumers are agents, and an agent handed `qualityScore: 84` with no
 * basis has no way to know it is reading a relevance rank rather than a safety verdict.
 * On a product whose entire claim is "we tell you what we do and do not know", saying
 * nothing to the machine audience is the same failure as overclaiming to the human one.
 *
 * Two rules this file exists to enforce:
 *   1. ONE definition. Nine surfaces independently asserting Bitcoin anchoring is how the
 *      false claim survived nine hand corrections; provenance gets one builder so it
 *      cannot fork.
 *   2. DERIVED, never written down. The anchor half comes from the published ledger via
 *      anchorState(), so it degrades honestly on its own if anchoring ever stops.
 */

export type ProvenanceAnchor = {
  chain_root: string;
  stamped_at: string;
  bitcoin_block: number | null;
  proof: string;
  verify: string;
};

export type Provenance = {
  source: 'mcpindex.ai';
  basis: string;
  limits: string[];
  snapshot?: { version: string; written_at: string };
  anchor: ProvenanceAnchor | null;
  docs: string;
};

/** What the directory's own numbers ARE. Kept beside the ranker it describes. */
export const RANKING_BASIS =
  'Relevance-dominant keyword match over registry title/description, with the MCP ' +
  'Quality Score as a small tiebreak. A rank is not a safety verdict.';

/** What a registry-derived listing or diff IS. */
export const CATALOG_BASIS =
  'Mirror of the official MCP registry snapshot, re-indexed by mcpindex. Field values ' +
  'are the registry publisher\'s own claims, not mcpindex findings.';

/**
 * Anchor half of the provenance block, or null when no confirmed anchor backs it.
 *
 * Returns null for a PENDING anchor as well as for none at all. A pending proof is a
 * calendar receipt that attests nothing on-chain, and a consumer that saw an `anchor`
 * key would reasonably read it as settled - so the honest wire value is its absence.
 */
export function anchorProvenance(state: AnchorState = anchorState()): ProvenanceAnchor | null {
  if (state.kind !== 'confirmed') return null;
  const e = state.latestConfirmed;
  return {
    chain_root: e.chain_root,
    stamped_at: e.stamped_at,
    bitcoin_block: e.bitcoin?.block_heights?.[0] ?? null,
    // `e.proof` is already the repo-relative `anchors/<64hex>.ots`, which is what
    // public/anchors/ serves - so the URL needs no reconstruction from the chain root,
    // and cannot drift from the file the ledger actually vouches for.
    proof: `https://mcpindex.ai/${e.proof}`,
    verify: 'https://mcpindex.ai/trust#anchor',
  };
}

export function buildProvenance(opts: {
  basis: string;
  limits?: readonly string[];
  snapshot?: { version: string; written_at: string };
  state?: AnchorState;
}): Provenance {
  return {
    source: 'mcpindex.ai',
    basis: opts.basis,
    // The advisory floor is ALWAYS present. Per-response code may add more specific
    // tokens; nothing may remove these, which is why they are spread in here rather
    // than passed by each caller.
    limits: [...ADVISORY_FLOOR, ...(opts.limits ?? [])],
    ...(opts.snapshot ? { snapshot: opts.snapshot } : {}),
    anchor: anchorProvenance(opts.state ?? anchorState()),
    docs: 'https://mcpindex.ai/methodology',
  };
}

/**
 * One-line provenance for the MCP text formatters, which return prose to an agent rather
 * than JSON. Short on purpose: it rides on every tool result, and a paragraph there is
 * context an agent pays for on every call.
 */
export function provenanceLine(state: AnchorState = anchorState()): string {
  const a = anchorProvenance(state);
  const anchored = a?.bitcoin_block
    ? ` Corpus anchored to Bitcoin block ${a.bitcoin_block} (verify: ${a.verify}).`
    : '';
  return `Source: mcpindex.ai - advisory, semantic-only screen; not a safety verdict.${anchored}`;
}
