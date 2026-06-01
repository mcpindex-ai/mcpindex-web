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
