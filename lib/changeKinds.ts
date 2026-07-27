// Surfaceable drift ChangeKind taxonomy (read side, M3/M4). The mini32 drain publishes a per-event
// `change_kinds` list (what changed: added-required-param, annotation-flip-to-destructive, ...)
// already filtered to the contract-affecting subset. This module is the DEFENSIVE consumer gate:
// the Upstash blob/meta is operator/attacker-controllable, so a value that reaches a public page
// or API must be re-validated against a fixed allowlist, deduped, sorted, and length-bounded.
//
// SOURCE OF TRUTH: this is the SURFACED subset - it mirrors `SURFACE_KINDS` in
// mcpindex-trust/scripts/drift_corpus_drain.py exactly (12 kinds). It is NOT the same list as the
// FULL detector taxonomy published in app/.well-known/mcp-index.json (that superset includes
// tool-added, which is deliberately not surfaced here). Keep in sync with the trust SURFACE_KINDS -
// a kind the drain surfaces but this set omits is silently dropped from the public display
// (fail-quiet, never fail-render). The test below pins the full member list to catch a 1-for-1 swap.

export const SURFACE_CHANGE_KINDS: ReadonlySet<string> = new Set([
  'added-required-param',
  'added-optional-param',
  'removed-param',
  'type-changed',
  'enum-values-removed',
  'constraint-narrowed',
  'required-set-expanded',
  'output-schema-changed',
  'output-schema-added',
  'annotation-flip-to-destructive',
  'tool-removed',
  'deep-schema-undiffable',
]);

// The SAFETY BIT, mirrored from the single source of truth:
// mcpindex-trust/corpus_eval/tooling/cse/schema_diff.py `_SAFETY_RELEVANT`.
// A kind is either on the operator's must-review list or it is not - severity is membership,
// never an ordinal. This mirror exists so the public surfaces (the posture figure D-07, the
// ledger) can render the bit WITHOUT hand-typing it a fourth time; the membership is pinned in
// changeKinds.test.ts so a taxonomy edit upstream that is not mirrored here fails the suite.
//
// SCOPE: this is the safety bit only. The GUARD posture's hold/proceed branch lives in the
// `mcpindex-gate` package (not in this repo), and the documented semantics on /methodology are
// "guard holds the unambiguously-breaking and dangerous changes while letting proven-benign drift
// through" - i.e. guard tracks this bit. Any figure that renders a posture column must SAY it is
// rendering the safety bit under the documented posture semantics, not a read of the gate's branch.
export const SAFETY_RELEVANT_CHANGE_KINDS: ReadonlySet<string> = new Set([
  'added-required-param',
  'removed-param',
  'type-changed',
  'enum-values-removed',
  'constraint-narrowed',
  'required-set-expanded',
  'annotation-flip-to-destructive',
  'output-schema-changed',
  'tool-removed',
  // A schema too deep to fully diff fails safe: it cannot be proven benign, so it joins the
  // must-review list rather than passing silently as 'no change'.
  'deep-schema-undiffable',
]);

/** True when a kind is on the operator's must-review list (the safety bit). */
export function isSafetyRelevant(kind: string): boolean {
  return SAFETY_RELEVANT_CHANGE_KINDS.has(kind);
}

// Hard cap on how many kinds render/return for one event - a hostile blob cannot bloat the page or
// the API response. Comfortably above the real taxonomy size (12) so a legitimate event is never
// truncated, while a forged 10k-element array is.
export const MAX_CHANGE_KINDS = 16;

/**
 * Coerce an untrusted `change_kinds` value into a validated, deduped, sorted, bounded list of KNOWN
 * surfaceable kinds. Accepts an array OR a JSON-string-of-array (Upstash auto-deserialization can
 * return either, same ambiguity the existing meta fields already absorb). Anything unknown,
 * malformed, oversized, or non-string is dropped. Never throws.
 */
export function coerceChangeKinds(raw: unknown, max: number = MAX_CHANGE_KINDS): string[] {
  let arr: unknown = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out = new Set<string>();
  // Input-side scan bound: never iterate a hostile mega-array. 1024 >> the ingest cap (64) >> the
  // taxonomy (12), so a legitimate value is never truncated; a forged 10M-element array is.
  const scanLimit = Math.min(arr.length, 1024);
  for (let i = 0; i < scanLimit; i++) {
    const k = arr[i];
    if (typeof k === 'string' && SURFACE_CHANGE_KINDS.has(k)) out.add(k);
    if (out.size >= max) break; // output-side bound: the rendered list can't grow past `max`
  }
  return [...out].sort();
}
