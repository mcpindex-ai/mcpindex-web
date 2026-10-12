// The facts registry: every hand-carried public number, with the command that produced it.
//
// A figure that lives in a deposit outside this repo (mcpindex-trust GATES.json, the drift-panel
// figures.json, the binding-gap results.json, the source-liveness aggregates) used to be typed into
// whichever page quoted it, with at best a comment saying where it came from. That is how llms.txt
// said Bitcoin anchoring was "not yet confirmed" for weeks after every anchor carried a block
// height, and how "top 10% of changers" shipped when the figure was the top 10% of eligible
// servers. Here each number carries its query, the date it was observed and, where the number is
// live rather than frozen, a max age. scripts/check-public-facts.mts fails CI when a guarded page
// prints a metric that does not come from here, when a fact outlives its max age, or (with
// --reproduce) when a query no longer prints the stored value.
//
// Values derived from a data file in this repo (LIVE_EDITION reading data/report-edition-v1.json,
// anchorClaim() reading data/verdict-anchors.json) do not belong here: the data file is already
// the source, and the code that reads it is the query.
import registry from './facts.json';

export type FactValue = number | string;

export interface Fact {
  readonly id: string;
  /** The published value. For a rounded figure this is the rounding of `raw`. */
  readonly value: FactValue;
  /** What the query prints, when it differs from the published value only by rounding. */
  readonly raw?: number;
  readonly unit: string;
  /** Exact command, run from the directory holding mcpindex-web and mcpindex-trust side by side. */
  readonly query: string;
  /** ISO date the measurement was taken (data cutoff), not the date it was copied here. */
  readonly observed_at: string;
  /** A live figure must be re-measured within this many days of observed_at. Frozen ones omit it. */
  readonly max_age_days?: number;
  readonly note?: string;
}

const ID_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Throws on the first malformed entry, so a bad registry fails the build that imports it. */
export function validateFacts(input: unknown): Fact[] {
  const doc = input as { schema_version?: unknown; facts?: unknown };
  if (doc?.schema_version !== '1') throw new Error('facts.json: schema_version must be "1"');
  if (!Array.isArray(doc.facts)) throw new Error('facts.json: facts must be an array');
  const seen = new Set<string>();
  for (const f of doc.facts as Fact[]) {
    if (typeof f.id !== 'string' || !ID_RE.test(f.id)) throw new Error(`facts.json: bad id ${JSON.stringify(f.id)}`);
    if (seen.has(f.id)) throw new Error(`facts.json: duplicate id ${f.id}`);
    seen.add(f.id);
    if (typeof f.value !== 'number' && typeof f.value !== 'string') throw new Error(`${f.id}: value must be a number or string`);
    if (typeof f.value === 'number' && !Number.isFinite(f.value)) throw new Error(`${f.id}: value is not finite`);
    if (f.raw !== undefined && (typeof f.raw !== 'number' || typeof f.value !== 'number')) {
      throw new Error(`${f.id}: raw is only for a rounded numeric value`);
    }
    if (typeof f.unit !== 'string' || !f.unit) throw new Error(`${f.id}: unit is required`);
    if (typeof f.query !== 'string' || f.query.trim().length < 8) throw new Error(`${f.id}: query is required`);
    if (typeof f.observed_at !== 'string' || !DATE_RE.test(f.observed_at)) throw new Error(`${f.id}: observed_at must be YYYY-MM-DD`);
    if (f.max_age_days !== undefined && !(Number.isInteger(f.max_age_days) && f.max_age_days > 0)) {
      throw new Error(`${f.id}: max_age_days must be a positive integer`);
    }
  }
  return doc.facts as Fact[];
}

export const FACTS: readonly Fact[] = validateFacts(registry);
const BY_ID = new Map(FACTS.map((f) => [f.id, f]));

export function getFact(id: string): Fact {
  const f = BY_ID.get(id);
  if (!f) throw new Error(`unknown fact ${id}`);
  return f;
}

export function factNumber(id: string): number {
  const v = getFact(id).value;
  if (typeof v !== 'number') throw new Error(`fact ${id} is not numeric`);
  return v;
}

export function factString(id: string): string {
  const v = getFact(id).value;
  if (typeof v !== 'string') throw new Error(`fact ${id} is not a string`);
  return v;
}

/** en-US with thousands separators; `dp` fixes decimals (24.5, 10.0) where the copy needs them. */
export function fmtFact(id: string, dp?: number): string {
  const n = factNumber(id);
  return dp === undefined
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function pctFact(id: string, dp = 1): string {
  return `${fmtFact(id, dp)}%`;
}
