import { factNumber } from './facts';

// Single source of truth for the v1-advisory honest-limits FLOOR - the posture
// every public trust surface states on the wire so no claim outruns a
// semantic-only screen. Per-response code may append more specific tokens
// (e.g. no_verdict_data_in_v1_advisory); this is the always-present base.
// Mirrored in the machine descriptor at /.well-known/mcp-index.json.
export const ADVISORY_FLOOR = [
  'conformance_monitored_not_enforced',
  'calibrated_false_v1',
  'advisory_deployment',
] as const;

// D3 graduation gate (mirror of mcpindex-trust/corpus_eval/GATES.json
// `current_conforming_labels` / criterion). Single source so the count cannot
// silently desync across surfaces (methodology, trust, about, the feeds, the
// machine descriptor). These are LABELED-conforming-corpus values and change
// ONLY when human-labeled conforming tools + a probed FP upper-95 exist;
// registry-screening coverage must never raise them (the honesty guard enforces).
//
// The values live in lib/facts.json with the query that produced them. Read the note on
// d3.conforming_labels before quoting it: mcpindex-trust corrected its own copy on 2026-07-13.
export const D3_CONFORMING_LABELS: number = factNumber('d3.conforming_labels');
export const D3_REQUIRED_LABELS: number = factNumber('d3.required_labels');
export const D3_FP_UPPER95_MAX_PCT: number = factNumber('d3.fp_upper95_max_pct');
export const D3_TERMINAL_V1_FLOOR: number = factNumber('d3.terminal_v1_floor');
export const D3_PROGRESS = `${D3_CONFORMING_LABELS}/${D3_REQUIRED_LABELS}`;
