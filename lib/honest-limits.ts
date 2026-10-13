import { factNumber, factString } from './facts';

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

// D3 conformance gate (mirror of mcpindex-trust/corpus_eval/GATES.json, banner d3-deferred).
// v1 is terminal: the pre-registered trigger (fewer than D3_TERMINAL_V1_FLOOR real-server
// conforming labels by D3_BAR_DATE) fired, and GB exercised it on 2026-10-12. Conformance
// ships advisory and uncalibrated in v1. No progress count is published: the last one
// ("15/150") came from a GATES.json copy that mcpindex-trust corrected on 2026-07-13, and the
// real-server count was 0. Registry-screening coverage never moves any of this (the honesty
// guard enforces).
//
// The values live in lib/facts.json with the query that produced them.
export const D3_REQUIRED_LABELS: number = factNumber('d3.required_labels');
export const D3_FP_UPPER95_MAX_PCT: number = factNumber('d3.fp_upper95_max_pct');
export const D3_TERMINAL_V1_FLOOR: number = factNumber('d3.terminal_v1_floor');
export const D3_V1_STATE: string = factString('d3.v1_state');
export const D3_BAR_DATE = '2026-09-01';

/** The one sentence every public surface uses for the v1 conformance state. */
export const D3_V1_STATEMENT =
  `Conformance is advisory and uncalibrated in v1 (${D3_V1_STATE}). ` +
  `The pre-registered bar was ${D3_REQUIRED_LABELS} human-labeled conforming tools from real servers ` +
  `with a false-positive upper 95% bound at or below ${D3_FP_UPPER95_MAX_PCT}%, and it was not met by the ` +
  `pre-registered date, ${D3_BAR_DATE}. A conformance result does not block or fail a tool.`;
