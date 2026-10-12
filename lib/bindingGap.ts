// The Binding Gap talk figures (AI Context San Jose, 2026-09-23), read from the v1 deposit
// (version DOI 10.5281/zenodo.21778282, mcpindex-trust corpus_eval/binding_baseline/deposit).
// Frozen with the deck: a later deposit version does not update them, it gets its own edition.
// The numbers live in lib/facts.json with their jq queries; this is the formatted view that
// /research/binding-gap and /llms.txt both render, so the two cannot disagree.
import { fmtFact, pctFact } from './facts';

const bg = (k: string) => `binding_gap.${k}`;

export const BINDING_GAP = {
  crawls: fmtFact(bg('crawls')),
  windowStart: '2026-06-09',
  windowEnd: '2026-08-01',
  entriesAttempted: fmtFact(bg('entries_attempted')),
  serversServing: fmtFact(bg('servers_serving')),
  tools: fmtFact(bg('tools')),
  declaringTools: fmtFact(bg('declaring_tools')),
  declaredPct: pctFact(bg('declared_pct')),
  boundPct: pctFact(bg('bound_pct')),
  gapPoints: fmtFact(bg('gap_points'), 1),
  gapLow: fmtFact(bg('gap_low'), 1),
  gapHigh: fmtFact(bg('gap_high'), 1),
} as const;
