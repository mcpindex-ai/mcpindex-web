// Pure logic for the weekly analyst (scripts/workforce/analyst.mts): re-run each fact's query
// against mcpindex-trust main, decide what may be written back to lib/facts.json, and render the
// change report. Nothing here touches the filesystem or a process, so every rule is unit-tested.
//
// Write policy, in order:
//   - a query that fails, prints nothing, prints more than one line, or prints a different shape
//     (text where a number was, a non-date where a date was) is a FAILURE. The whole run writes
//     nothing; a guessed value is worse than a stale one.
//   - a fact whose note says CONTRADICTED is re-run and reported, never written. A human decides.
//   - a fact without max_age_days is frozen with a deposit edition (lib/facts.ts: "Frozen ones
//     omit it"). If main now prints something else, the deposit under a published DOI changed;
//     that is reported as FROZEN-MOVED and fails the run, because silently re-pointing a page at
//     a number its cited DOI does not hold is the 2026-07 source-liveness incident again.
//   - a live fact (max_age_days set) is written: new value, raw, observed_at and query pin.
import type { Fact, FactValue } from '../facts';

/** Matches the commit pin in `git -C mcpindex-trust show <sha>:path`. */
const PIN_RE = /(git -C mcpindex-trust show )([0-9a-f]{7,40})(:)/g;

/** The query with every mcpindex-trust pin moved to `sha`. Queries with no pin come back as is. */
export function repinQuery(query: string, sha: string): string {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`not a commit sha: ${sha}`);
  return query.replace(PIN_RE, `$1${sha}$3`);
}

export function queryPins(query: string): string[] {
  return [...query.matchAll(PIN_RE)].map((m) => m[2]);
}

/** Units published with at least one decimal even when the stored value happens to be whole. */
const DECIMAL_UNITS = new Set(['percent', 'percentage points', 'days']);

function decimals(n: number): number {
  return (String(n).split('.')[1] ?? '').length;
}

/** Decimal places a fact is published with: what the value carries, at least 1 for rates. */
export function publishedDecimals(f: Fact): number {
  if (typeof f.value !== 'number') return 0;
  return Math.max(decimals(f.value), DECIMAL_UNITS.has(f.unit) ? 1 : 0);
}

/** Half-up rounding, matching roundsTo() in lib/factsGuard.ts (6.85 -> 6.9). */
export function roundHalfUp(raw: number, dp: number): number {
  const k = 10 ** dp;
  return Math.floor(raw * k + 0.5 + 1e-9) / k;
}

/** Strips float noise jq can print (59.309999999999995 -> 59.31). */
export function clean(n: number): number {
  return Number.parseFloat(n.toPrecision(12));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

export type Parsed = { ok: true; value: FactValue; raw?: number } | { ok: false; reason: string };

/** Parses query output against the stored fact's shape. Never coerces. */
export function parseOutput(f: Fact, stdout: string): Parsed {
  const out = stdout.trim();
  if (!out) return { ok: false, reason: 'query printed nothing' };
  if (out.includes('\n')) return { ok: false, reason: `shape change: ${out.split('\n').length} lines where one value was expected` };
  if (typeof f.value === 'number') {
    if (!NUM_RE.test(out)) return { ok: false, reason: `shape change: printed ${JSON.stringify(out.slice(0, 60))} where a number was expected` };
    const raw = clean(Number(out));
    const value = roundHalfUp(raw, publishedDecimals(f));
    return Math.abs(value - raw) < 1e-9 ? { ok: true, value } : { ok: true, value, raw };
  }
  if (DATE_RE.test(f.value) && !DATE_RE.test(out)) {
    return { ok: false, reason: `shape change: printed ${JSON.stringify(out.slice(0, 60))} where a YYYY-MM-DD date was expected` };
  }
  return { ok: true, value: out };
}

export type QueryRun = { ok: true; stdout: string } | { ok: false; error: string };

export type Outcome =
  | { kind: 'unchanged'; fact: Fact }
  | { kind: 'remeasured'; fact: Fact; next: Fact }
  | { kind: 'moved'; fact: Fact; next: Fact }
  | { kind: 'frozen-moved'; fact: Fact; value: FactValue; raw?: number }
  | { kind: 'contradicted'; fact: Fact; printed: string }
  | { kind: 'failed'; fact: Fact; reason: string };

export function isContradicted(f: Fact): boolean {
  return /\bCONTRADICTED\b/.test(f.note ?? '');
}

/** The comparable measurement: raw when present, else the value. */
function measured(f: Fact): FactValue {
  return f.raw ?? f.value;
}

function same(a: FactValue, b: FactValue): boolean {
  return typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : a === b;
}

/** Builds the next registry entry: same key order, raw added or dropped as the rounding needs. */
export function nextFact(f: Fact, value: FactValue, raw: number | undefined, query: string, observedAt: string): Fact {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === 'raw') continue;
    out[k] = k === 'value' ? value : k === 'query' ? query : k === 'observed_at' ? observedAt : v;
    if (k === 'value' && raw !== undefined) out.raw = raw;
  }
  return out as unknown as Fact;
}

/** Decides what happens to one fact given its re-run. `query` is the repinned command. */
export function judge(f: Fact, run: QueryRun, query: string, today: string): Outcome {
  if (isContradicted(f)) {
    return { kind: 'contradicted', fact: f, printed: run.ok ? run.stdout.trim() || '(nothing)' : `query failed: ${run.error}` };
  }
  if (!run.ok) return { kind: 'failed', fact: f, reason: `query failed: ${run.error}` };
  const p = parseOutput(f, run.stdout);
  if (!p.ok) return { kind: 'failed', fact: f, reason: p.reason };
  const moved = !same(measured(f), p.raw ?? p.value) || !same(f.value, p.value);
  if (f.max_age_days === undefined) {
    return moved ? { kind: 'frozen-moved', fact: f, value: p.value, raw: p.raw } : { kind: 'unchanged', fact: f };
  }
  const next = nextFact(f, p.value, p.raw, query, today);
  return moved ? { kind: 'moved', fact: f, next } : { kind: 'remeasured', fact: f, next };
}

/** True when the run may write: no failure and no frozen fact moved under its DOI. */
export function writable(outcomes: readonly Outcome[]): boolean {
  return !outcomes.some((o) => o.kind === 'failed' || o.kind === 'frozen-moved');
}

/** Entries the run writes back: moved and re-measured live facts. */
export function writes(outcomes: readonly Outcome[]): Fact[] {
  return outcomes.flatMap((o) => (o.kind === 'moved' || o.kind === 'remeasured' ? [o.next] : []));
}

export function delta(a: FactValue, b: FactValue): string {
  if (typeof a !== 'number' || typeof b !== 'number') return `${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
  const d = clean(b - a);
  const pct = a === 0 ? 'from zero' : `${d >= 0 ? '+' : ''}${clean((d / a) * 100).toFixed(1)}%`;
  return `${a} -> ${b} (${d >= 0 ? '+' : ''}${d}, ${pct})`;
}

// --- facts.json text surgery -----------------------------------------------------------------
// The file is hand-formatted in places (10.0 stays 10.0). Re-serialising the whole document
// would rewrite facts nobody touched, so only the object of a changed fact is replaced.

/** [start, end) of the `{...}` object holding `"id": "<id>"`, string-aware. */
export function factSpan(text: string, id: string): [number, number] {
  const needle = `"id": ${JSON.stringify(id)}`;
  const at = text.indexOf(needle);
  if (at < 0 || text.indexOf(needle, at + 1) >= 0) throw new Error(`facts.json: expected exactly one entry for ${id}`);
  const start = text.lastIndexOf('{', at);
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return [start, i + 1];
  }
  throw new Error(`facts.json: unbalanced object for ${id}`);
}

/** facts.json text with each given fact's object replaced, every other byte untouched. */
export function applyWrites(text: string, facts: readonly Fact[]): string {
  let out = text;
  for (const f of facts) {
    const [a, b] = factSpan(out, f.id);
    const lineStart = out.lastIndexOf('\n', a) + 1;
    const indent = out.slice(lineStart, a);
    const body = JSON.stringify(f, null, 2).split('\n').join(`\n${indent}`);
    out = out.slice(0, a) + body + out.slice(b);
  }
  return out;
}

// --- report ------------------------------------------------------------------------------------

export interface ReportMeta {
  readonly date: string;
  readonly trustSha: string;
  readonly trustRemote: string;
}

export function renderReport(meta: ReportMeta, outcomes: readonly Outcome[]): string {
  const by = <K extends Outcome['kind']>(k: K) => outcomes.filter((o): o is Extract<Outcome, { kind: K }> => o.kind === k);
  const lines: string[] = [];
  const verdict = !writable(outcomes)
    ? 'FAILED, nothing written'
    : by('moved').length
      ? `${by('moved').length} fact(s) moved and written`
      : by('remeasured').length
        ? 'no fact moved; live facts re-dated'
        : 'no fact moved; nothing written';
  lines.push(`Analyst run ${meta.date} against mcpindex-trust main ${meta.trustSha} (${meta.trustRemote}): ${verdict}.`);
  lines.push(`${outcomes.length} facts: ${by('moved').length} moved, ${by('remeasured').length} re-measured unchanged, ${by('unchanged').length} frozen unchanged, ${by('frozen-moved').length} frozen moved, ${by('contradicted').length} contradicted (skipped), ${by('failed').length} failed.`);
  const section = (title: string, rows: string[]) => {
    if (!rows.length) return;
    lines.push('', `${title}:`);
    for (const r of rows) lines.push(`  ${r}`);
  };
  section('FAILED (run writes nothing)', by('failed').map((o) => `${o.fact.id}: ${o.reason}`));
  section(
    'FROZEN-MOVED (deposit changed under a published edition; needs a decision, not written)',
    by('frozen-moved').map((o) => `${o.fact.id}: ${delta(measured(o.fact), o.raw ?? o.value)}`),
  );
  section(
    'Moved (written)',
    by('moved').map((o) => {
      const raw = o.fact.raw !== undefined || o.next.raw !== undefined ? `; raw ${delta(measured(o.fact), measured(o.next))}` : '';
      return `${o.fact.id}: ${delta(o.fact.value, o.next.value)}${raw}; pin ${queryPins(o.fact.query).join(',') || 'none'} -> ${queryPins(o.next.query).join(',') || 'none'}`;
    }),
  );
  section('Re-measured, unchanged (observed_at moved)', by('remeasured').map((o) => `${o.fact.id}: ${JSON.stringify(o.fact.value)}`));
  section(
    'CONTRADICTED (reported, never auto-updated)',
    by('contradicted').map((o) => `${o.fact.id}: registry ${JSON.stringify(o.fact.value)}; main prints ${o.printed}`),
  );
  if (by('unchanged').length) {
    lines.push('', `Frozen, unchanged at main: ${by('unchanged').map((o) => o.fact.id).join(', ')}`);
  }
  return lines.join('\n');
}
