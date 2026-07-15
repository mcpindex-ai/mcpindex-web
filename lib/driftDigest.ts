// Pure digest builder for the on-site Drift Report section. Aggregates the ledger's
// per-event ChangeKinds into the human-readable "what changed this week" breakdown.
// Deterministic, honest, no verdict language. Rendered server-side from the same
// loadLedger() data the /ledger page already uses (auto-publishes on ISR).

import type { LedgerEvent } from './ledger';

export interface DriftStandout {
  readonly kind: string;
  readonly count: number;
  readonly label: string; // plain-English, count injected by the renderer
}

// Safety-relevant ChangeKind -> plain English, most-alarming first (render priority).
// Contract-diff descriptions only; never "attack"/"malicious"/a verdict.
const CHANGEKIND_COPY: ReadonlyArray<readonly [string, string]> = [
  ['annotation-flip-to-destructive', 'flipped a read-only hint toward write, delete, or send (the "read tool quietly became a write tool" case)'],
  ['added-required-param', 'added a newly-required parameter, which breaks an agent still calling with last week’s arguments'],
  ['removed-param', 'removed a parameter your agent may still be sending'],
  ['output-schema-changed', 'changed their output schema, the shape of what comes back'],
  ['constraint-narrowed', 'narrowed a constraint, a tighter enum or range than you pinned'],
  ['type-changed', 'changed a parameter’s type'],
];

export interface DriftDigest {
  readonly standouts: readonly DriftStandout[];
  readonly benign: number; // added-optional-param: the no-false-alarm control
}

/** Aggregate ChangeKinds across events into the digest. Total, deterministic. */
export function buildDigest(events: readonly LedgerEvent[]): DriftDigest {
  const counts = new Map<string, number>();
  for (const e of events) {
    for (const k of e.change_kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const standouts: DriftStandout[] = [];
  for (const [kind, label] of CHANGEKIND_COPY) {
    const count = counts.get(kind) ?? 0;
    if (count > 0) standouts.push({ kind, count, label });
  }
  return { standouts, benign: counts.get('added-optional-param') ?? 0 };
}
