// Opt-in drift telemetry aggregate counters (M5, read side) — PURE part: the DriftStats shape +
// the integer coercion. No Upstash token here, so it is safe to import anywhere and unit-testable
// in plain node. The token-holding reader lives in `driftStatsServer.ts` (import 'server-only').

export interface DriftStats {
  signalsTotal: number;
  pins: number;
  drifts: number;
  safetyRelevant: number;
  optedInInstalls: number;
  serversCovered: number;
}

export function coerceNonNegInt(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}
