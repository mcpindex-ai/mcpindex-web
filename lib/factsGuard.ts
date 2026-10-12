// Pure logic behind scripts/check-public-facts.mts, kept in lib/ so it is unit-tested.
//
// The guard answers one question per guarded file: does any metric-shaped number appear in the
// prose as a literal, rather than rendered from lib/facts.json or a data file? Prose means what a
// reader or an answer engine sees: JSX text, string literals and the static parts of template
// literals. Interpolations (`${...}`, `{...}`) are code, so anything rendered from a source passes
// by construction. A literal passes only if a rule below explains why it is not a metric.
import ts from 'typescript';
import type { Fact } from './facts';

/**
 * The pages that carry corpus or drift metrics. Kept narrow on purpose: these are the surfaces an
 * answer engine quotes, and every number on them is either a measurement or explained below.
 * Not covered (yet): content/guides/*.json (prose figures are bound by lib/driftDefinition.test.ts
 * needles instead), /methodology, /trust, /about, /whitepaper.
 */
export const GUARDED_FILES = [
  'app/llms.txt/route.ts',
  'app/llms-full.txt/route.ts',
  'app/drift/page.tsx',
  'app/drift-report/page.tsx',
  'app/stats/page.tsx',
  'app/research/binding-gap/page.tsx',
  'app/research/source-liveness/page.tsx',
] as const;

export interface AllowRule {
  readonly pattern: RegExp;
  /** Limit the rule to these files; omitted = every guarded file. */
  readonly files?: readonly string[];
  readonly reason: string;
  /**
   * non-metric: the number is not a measurement (a label, a protocol constant, a version).
   * unsourced: a measurement with no query found yet. Known debt, listed so it is visible; the
   * guard fails if one stops matching, so fixing the page forces the entry out of this list.
   */
  readonly kind: 'non-metric' | 'unsourced';
}

/** Shapes that are never metrics, stripped before any rule is consulted. */
const STRUCTURAL: readonly RegExp[] = [
  /https?:\/\/\S+/g, // URLs
  /\S*\/\S*/g, // anything with a slash: DOIs, API paths, req/min, ratios already rendered
  /\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?\b/g, // ISO dates and timestamps
  /\b(?:19|20)\d{2}\b/g, // years
  /\b\d+\.\d+\.\d+\b/g, // semver
  /\b\d{4}\.\d{4,5}\b/g, // arXiv ids
  /\b\d{4}-\d{4}-\d{4}-\d{3}[\dX]\b/g, // ORCID
  /\S*\[[^\]]*\]\S*/g, // Tailwind arbitrary values: text-[15px], leading-[1.65]
  /\bCC[- ]BY[- ]\d\.\d\b/gi, // licence names
  /\b(?:200|301|302|307|308|401|403|404|410|429|451)s?\b/g, // HTTP status codes
];

export const ALLOW: readonly AllowRule[] = [
  { pattern: /\btiers? \d(?:-\d)?\b/g, reason: 'gate tier labels (tier-0, tiers 1-3)', kind: 'non-metric' },
  { pattern: /\b(?:MCP|RSS) 2\.0\b/g, reason: 'protocol and feed-format version names', kind: 'non-metric' },
  { pattern: /\bon call 1\b/g, reason: 'means the first call, not a count', kind: 'non-metric' },
  { pattern: /\bsources=1\b/g, reason: 'value of the API field sources (crawler-only floor)', kind: 'non-metric' },
  { pattern: /\bOpenAPI 3\.1\b/g, reason: 'spec version', kind: 'non-metric' },
  { pattern: /\bversion \d+\.\d+\b/g, reason: 'paper version', kind: 'non-metric' },
  { pattern: /~10 min(?:utes)?\b|~1 hour\b|\bN=6\b/g, reason: 'OTS cadence policy (GATES.json ots-cadence banner): Bitcoin block interval and the pinned confirmation depth', kind: 'non-metric' },
  { pattern: /\b(?:30|60|89)[- ]days?\b|\bfor (?:30|60|89)\b/gi, reason: 'survival horizons of the drift panel (survival.csv horizon_days), fixed by the frozen deposit', kind: 'non-metric' },
  { pattern: /\b95% confidence\b/g, reason: 'confidence level, not a measurement', kind: 'non-metric' },
  { pattern: /\b48 hours\b/g, reason: 'liveness debounce rule (two checks 48h apart)', kind: 'non-metric' },
  { pattern: /\bthe 6 tools\b/g, files: ['app/llms.txt/route.ts'], reason: 'tool count of our own MCP server, a product surface, not corpus data', kind: 'non-metric' },
  { pattern: /\btop 3 servers\b/g, files: ['app/llms.txt/route.ts'], reason: 'API contract of /api/v1/preflight', kind: 'non-metric' },
  { pattern: /\bTop 50 by\b/g, files: ['app/llms.txt/route.ts'], reason: 'leaderboard page size', kind: 'non-metric' },
  { pattern: /\b60 req\b/g, files: ['app/stats/page.tsx'], reason: 'API rate limit', kind: 'non-metric' },
  { pattern: /\blast 7 days\b/g, files: ['app/stats/page.tsx'], reason: 'UI window label', kind: 'non-metric' },
  { pattern: /\bevery 5 minutes\b/g, files: ['app/drift-report/page.tsx'], reason: 'page revalidation interval', kind: 'non-metric' },
  { pattern: /\b23 (?:Sep|September)\b|\b23 pages\b/g, files: ['app/research/binding-gap/page.tsx'], reason: 'talk date and slide count', kind: 'non-metric' },
  { pattern: /\(§7\)/g, files: ['app/llms-full.txt/route.ts'], reason: 'whitepaper section reference', kind: 'non-metric' },

  { pattern: /\broughly 2,090\b/g, files: ['app/drift-report/page.tsx'], reason: 'population size; only source found is prose in mcpindex-trust corpus_eval/drift_report_v11/README.md ("approximately 2,090")', kind: 'unsourced' },
  { pattern: /\b55,443-event\b/g, files: ['app/drift-report/page.tsx'], reason: 'raw event census; only source found is tasks/growth/drift-report-validation.md, a working note', kind: 'unsourced' },
  { pattern: /\b0 misclassifications\b/g, files: ['app/drift-report/page.tsx'], reason: 'census result; no artifact found that records it', kind: 'unsourced' },
  { pattern: /\b20,000\+/g, files: ['app/stats/page.tsx'], reason: 'third-party directory counts; no citation on the page', kind: 'unsourced' },
];

const NUMBER = /(?<![A-Za-z0-9_.\-:#@§])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?(?![A-Za-z0-9_])/g;

export interface ProseRun {
  readonly line: number;
  readonly text: string;
}

const PROSE_ATTRS = new Set(['alt', 'title', 'aria-label']);

/** The reader-visible text of a TS/TSX file, one run per literal, with interpolations removed. */
export function extractProse(file: string, src: string): ProseRun[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, kind);
  const runs: ProseRun[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxAttribute(n) && !PROSE_ATTRS.has(n.name.getText(sf))) return;
    // Response headers (Cache-Control and friends) are protocol, not prose.
    if (ts.isPropertyAssignment(n) && n.name.getText(sf).replace(/['"]/g, '') === 'headers') return;
    // A short literal handed to a call is a formatting argument (padStart(2, '0')), not prose.
    if (ts.isStringLiteral(n) && ts.isCallExpression(n.parent) && n.text.length <= 2) return;
    let text: string | null = null;
    if (ts.isJsxText(n)) text = n.text;
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) text = n.text;
    if (text && /\d/.test(text)) {
      runs.push({ line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, text });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return runs;
}

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly literal: string;
  readonly context: string;
}

export interface ScanResult {
  readonly findings: Finding[];
  /** Index into ALLOW of every rule that matched at least once in this file. */
  readonly used: Set<number>;
}

export function scanFile(file: string, src: string, allow: readonly AllowRule[] = ALLOW): ScanResult {
  const findings: Finding[] = [];
  const used = new Set<number>();
  for (const run of extractProse(file, src)) {
    let t = run.text.replace(/\s+/g, ' ');
    const original = t;
    // Phrase rules first: some of them span a token the structural pass would eat ("60 req/min").
    allow.forEach((rule, i) => {
      if (rule.files && !rule.files.includes(file)) return;
      const next = t.replace(rule.pattern, ' ');
      if (next !== t) used.add(i);
      t = next;
    });
    for (const re of STRUCTURAL) t = t.replace(re, ' ');
    for (const m of t.matchAll(NUMBER)) {
      const at = original.indexOf(m[0]);
      const context = at >= 0 ? original.slice(Math.max(0, at - 50), at + m[0].length + 30) : original.slice(0, 80);
      findings.push({ file, line: run.line, literal: m[0], context: context.trim() });
    }
  }
  return { findings, used };
}

/** Facts whose max_age_days has elapsed since observed_at, as of `today` (YYYY-MM-DD, UTC). */
export function staleFacts(facts: readonly Fact[], today: string): { id: string; ageDays: number; max: number }[] {
  const now = Date.parse(`${today}T00:00:00Z`);
  const out: { id: string; ageDays: number; max: number }[] = [];
  for (const f of facts) {
    if (f.max_age_days === undefined) continue;
    const age = Math.floor((now - Date.parse(`${f.observed_at}T00:00:00Z`)) / 86_400_000);
    if (age > f.max_age_days) out.push({ id: f.id, ageDays: age, max: f.max_age_days });
  }
  return out;
}

/** Half-up rounding of `raw` to the decimals `value` is published with (6.85 -> 6.9, not 6.8). */
export function roundsTo(raw: number, value: number): boolean {
  const dp = (String(value).split('.')[1] ?? '').length;
  const k = 10 ** dp;
  return Math.abs(Math.floor(raw * k + 0.5 + 1e-9) / k - value) < 1e-9;
}

export interface AnchorLedgerSummary {
  readonly total: number;
  readonly confirmed: number;
  /** Every block height on the most recent confirmed entry. */
  readonly latestHeights: readonly number[];
}

export function summarizeAnchorLedger(raw: unknown): AnchorLedgerSummary {
  const anchors = ((raw as { anchors?: unknown })?.anchors ?? []) as {
    bitcoin?: { block_heights?: number[] };
  }[];
  const confirmed = anchors.filter((a) => (a.bitcoin?.block_heights?.length ?? 0) > 0);
  return {
    total: anchors.length,
    confirmed: confirmed.length,
    latestHeights: confirmed.at(-1)?.bitcoin?.block_heights ?? [],
  };
}

const PENDING_WORDING = /not yet confirmed|no anchor has been published|not yet anchored|pending/i;
const ANCHORED_WORDING = /anchored to Bitcoin/i;

/**
 * Checks the one sentence about verdict-history anchoring against the ledger, independently of
 * anchorClaim(), so a hardcoded sentence or a regression in that function both fail here.
 * Returns an error message, or null when the statement matches the data.
 */
export function checkAnchorStatement(body: string, label: string, ledger: AnchorLedgerSummary): string | null {
  const line = body.split('\n').find((l) => /\bHistory:/.test(l));
  if (!line) return `${label}: no "History:" line; the anchoring statement is missing or was renamed`;
  const statement = line.slice(line.indexOf('History:'), line.indexOf('Cadence bound') > 0 ? line.indexOf('Cadence bound') : undefined);
  if (ledger.confirmed > 0) {
    if (!ANCHORED_WORDING.test(statement)) {
      return `${label}: ${ledger.confirmed} of ${ledger.total} anchors carry a Bitcoin block height, but the statement does not say anchored: "${statement.trim()}"`;
    }
    if (PENDING_WORDING.test(statement)) {
      return `${label}: ${ledger.confirmed} anchors are confirmed, but the statement still reads as pending: "${statement.trim()}"`;
    }
    const heights = ledger.latestHeights.map((h) => h.toLocaleString('en-US'));
    if (heights.length && !heights.some((h) => statement.includes(h))) {
      return `${label}: latest confirmed anchor is at block ${heights.join(' / ')}, statement cites another: "${statement.trim()}"`;
    }
    return null;
  }
  if (ANCHORED_WORDING.test(statement)) {
    return `${label}: no anchor carries a Bitcoin block height (${ledger.total} published), but the statement claims anchored: "${statement.trim()}"`;
  }
  return null;
}

/**
 * Checks the D3 sentence in a rendered llms body. v1 is terminal (exercised 2026-10-12): the body
 * must state calibrated=false and that conformance does not block or fail a tool, and it may not
 * print a progress count against the bar. "15/150" shipped for months after mcpindex-trust had
 * corrected the real-server count to 0. Returns an error message, or null when the body is right.
 */
export function checkD3Statement(body: string, label: string, required: number): string | null {
  const counter = new RegExp(`\\b\\d{1,4}\\s*(?:/|of)\\s*${required}\\b`);
  const hit = body.match(counter);
  if (hit) {
    return `${label}: prints a D3 progress count "${hit[0]}". v1 is terminal and publishes no count against the ${required}-label bar.`;
  }
  const line = body.split('\n').find((l) => /\bD3\b/.test(l));
  if (!line) return `${label}: no line names the D3 gate; the terminal-v1 statement is missing`;
  if (!line.includes('calibrated=false') || !/does not block or fail a tool/.test(line)) {
    return `${label}: the D3 line does not state the terminal-v1 state (calibrated=false, does not block or fail a tool): "${line.trim().slice(0, 160)}"`;
  }
  return null;
}
