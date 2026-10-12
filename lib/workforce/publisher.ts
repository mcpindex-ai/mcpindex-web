// Pure logic for the weekly publisher (scripts/workforce/publisher.mts). After the analyst moves a
// fact, the value on every page updates by itself because pages render it from the registry. What
// does not update is a word that depends on it: "rose", "most", "under a fifth". The publisher
// finds paragraphs where a moved fact sits next to such a word, asks the local model for new
// wording with every value left as a {{token}}, and refuses any reply that adds a number, drops
// a token, breaks markup, or trips a citing trap. Code, never the model, puts values on the page.
import type { Fact } from '../facts';
import { display, paragraphFacts, type Paragraph } from './citations';
import { rule0Hits } from './rule0';

/** Words whose truth depends on the size or direction of a nearby number. */
export const DEPENDENT_WORDING =
  /\b(?:rose|risen|rise|fell|fallen|fall|grew|grown|increase[sd]?|decrease[sd]?|dropped|drop|climbed|declined?|higher|lower|larger|smaller|more than|less than|fewer than|at least|at most|over|under|nearly|almost|roughly|about|around|majority|minority|most|half|third|quarter|fifth|tenth|one in|doubled|tripled|exceeds?|below|above|only|still|wider|narrower)\b/i;

/** Paragraphs worth a model call: they render a moved fact and carry number-dependent wording. */
export function candidates(paragraphs: readonly Paragraph[], moved: ReadonlySet<string>): Paragraph[] {
  return paragraphs.filter((p) => {
    if (![...paragraphFacts(p)].some((id) => moved.has(id))) return false;
    const words = p.segments.map((s) => (s.kind === 'text' ? s.text : ' ')).join('');
    return DEPENDENT_WORDING.test(words);
  });
}

export interface FactChange {
  readonly before: Fact;
  readonly after: Fact;
}

const TOKEN_RE = /\{\{([a-z]+:[^{}]+?)\}\}/g;

export function tokensOf(text: string): string[] {
  return [...text.matchAll(TOKEN_RE)].map((m) => m[1]);
}

function legend(p: Paragraph, changes: ReadonlyMap<string, FactChange>, all: ReadonlyMap<string, Fact>): string[] {
  const rows: string[] = [];
  for (const s of p.segments) {
    if (s.kind !== 'token') continue;
    if (s.token.startsWith('keep:')) {
      rows.push(`{{${s.token}}}: markup or a value that is not a registry fact; keep it, do not describe it`);
      continue;
    }
    const parts = s.facts.map((id) => {
      const c = changes.get(id);
      const f = c?.after ?? all.get(id);
      const note = f?.note ? ` Note: ${f.note}` : '';
      return c
        ? `${id} (${f?.unit}) MOVED from ${c.before.value} to ${c.after.value}.${note}`
        : `${id} (${f?.unit}) unchanged at ${f?.value}.${note}`;
    });
    const kind = s.token.startsWith('derived:') ? 'a value computed from ' : '';
    rows.push(`{{${s.token}}}: ${kind}${parts.join('; ')}`);
  }
  return rows;
}

/** One prompt per page: the candidate paragraphs, numbered, each with its token legend. */
export function buildPrompt(file: string, cands: readonly Paragraph[], changes: ReadonlyMap<string, FactChange>, all: ReadonlyMap<string, Fact>): { system: string; user: string } {
  const system = [
    'You edit wording on a public research page after a measured figure changed.',
    'Values are shown as {{tokens}}. Code renders every value; you never write one.',
    'Rules:',
    '- Choose at most ONE paragraph, and only if a word in it is now wrong or misleading for the new value (direction words like rose/fell, size words like most/half/under). If none is, choose null.',
    '- Change as few words as possible. Keep every other word exactly as it was.',
    '- Use every token exactly once, spelled exactly as given. Do not invent tokens.',
    '- Write no digits and no number words (one, two, half, third, dozen...) that are not already in the paragraph.',
    '- Do not widen a claim: no "the ecosystem", "across the registry", "most servers" unless already there. Keep every qualifier (upper bound, version bump, eligible, publisher, at most, of the).',
    '- A descriptor_any figure is an upper bound that includes bare version bumps; never call it "the drift rate".',
    '- A top-tenth share is of the ELIGIBLE servers ranked by changes, not of servers that changed.',
    '- ASCII only: plain hyphen, straight quotes. No em dash.',
    '- Plain, flat prose. None of: delve, leverage, robust, crucial, vital, pivotal, landscape, ecosystem, notably, moreover, furthermore, additionally, underscore.',
    'Reply with JSON only: {"choice": <paragraph number or null>, "text": "<the full rewritten paragraph with tokens>"}.',
  ].join('\n');
  const user = [
    `Page: ${file}`,
    ...cands.flatMap((p, i) => ['', `Paragraph ${i + 1}:`, display(p), 'Tokens:', ...legend(p, changes, all).map((r) => `  ${r}`)]),
  ].join('\n');
  return { system, user };
}

export type Reply = { choice: null } | { choice: number; text: string };

/** Parses the model's JSON. Throws on anything else; a bad reply fails the run, it is not retried. */
export function parseReply(raw: string, count: number): Reply {
  const body = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  let j: { choice?: unknown; text?: unknown };
  try {
    j = JSON.parse(body);
  } catch {
    throw new Error(`model reply is not JSON: ${body.slice(0, 120)}`);
  }
  if (j.choice === null || j.choice === undefined) return { choice: null };
  if (typeof j.choice !== 'number' || !Number.isInteger(j.choice) || j.choice < 1 || j.choice > count) {
    throw new Error(`model chose paragraph ${JSON.stringify(j.choice)}, expected 1..${count} or null`);
  }
  if (typeof j.text !== 'string' || !j.text.trim()) throw new Error('model chose a paragraph but returned no text');
  return { choice: j.choice, text: j.text.trim() };
}

const NUMBER_RUN = /\d[\d,.]*/g;
const NUMBER_WORDS =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|million|billion|dozen|half|halves|third|thirds|quarter|quarters|fifth|fifths|tenth|tenths|twice|double|doubled|triple|tripled|percent)\b/gi;
const SCOPE_CLAIMS = /\b(?:the ecosystem|across the registry|the whole registry|every server|all servers|most servers|most mcp servers|the drift rate|industry-wide)\b/gi;
const QUALIFIERS = /\b(?:upper bound|version bumps?|eligible|publishers?|fleet|at most|at least|self-reported|of the|single vantage|baseline)\b/gi;

const lowerAll = (re: RegExp, s: string) => [...s.matchAll(re)].map((m) => m[0].toLowerCase());

/** Every reason the rewrite may not go on the page. Empty means it may. */
export function validateRewrite(p: Paragraph, text: string): string[] {
  const errs: string[] = [];
  const before = display(p);
  const want = p.segments.flatMap((s) => (s.kind === 'token' ? [s.token] : [])).sort();
  const got = tokensOf(text).sort();
  if (JSON.stringify(want) !== JSON.stringify(got)) {
    errs.push(`tokens changed: expected [${want.join(', ')}], got [${got.join(', ')}]`);
  }
  const words = text.replace(TOKEN_RE, ' ');
  const wordsBefore = before.replace(TOKEN_RE, ' ');
  if (/\{\{|\}\}/.test(words)) errs.push('malformed token');

  const oldNums = new Set(wordsBefore.match(NUMBER_RUN) ?? []);
  const newNums = (words.match(NUMBER_RUN) ?? []).filter((n) => !oldNums.has(n));
  if (newNums.length) errs.push(`number(s) written by the model, not rendered from the registry: ${newNums.join(', ')}`);
  const oldWords = new Set(lowerAll(NUMBER_WORDS, wordsBefore));
  const newWords = lowerAll(NUMBER_WORDS, words).filter((w) => !oldWords.has(w));
  if (newWords.length) errs.push(`number word(s) not in the original: ${[...new Set(newWords)].join(', ')}`);

  const oldScope = new Set(lowerAll(SCOPE_CLAIMS, wordsBefore));
  const newScope = lowerAll(SCOPE_CLAIMS, words).filter((w) => !oldScope.has(w));
  if (newScope.length) errs.push(`widened claim (one-publisher / descriptor trap): ${[...new Set(newScope)].join(', ')}`);
  const keptQual = new Set(lowerAll(QUALIFIERS, words).map((q) => q.replace(/s$/, '')));
  const lostQual = [...new Set(lowerAll(QUALIFIERS, wordsBefore).map((q) => q.replace(/s$/, '')))].filter((q) => !keptQual.has(q));
  if (lostQual.length) errs.push(`qualifier(s) dropped: ${lostQual.join(', ')}`);
  if ([...paragraphFacts(p)].some((id) => id.startsWith('drift_panel.descriptor_pct')) && /\bdrift rate\b/i.test(words)) {
    errs.push('descriptor_any figure called a drift rate; it is an upper bound that includes version bumps');
  }
  if (/\btop (?:tenth|10%)[^.]{0,40}\b(?:servers that changed|changers|changed servers)\b/i.test(words)) {
    errs.push('top-tenth share restated over servers that changed; it is over eligible servers');
  }

  if (p.mode === 'jsx' && /[{}<>]/.test(words)) errs.push('JSX-significant character ({, }, <, >) in prose');
  if (p.mode === 'template' && /[`\\]|\$\{/.test(words)) errs.push('template-significant character (backtick, backslash, ${) in prose');
  if (p.mode === 'template' && /\n/.test(text)) errs.push('a template line may not gain a line break');

  for (const h of rule0Hits(words)) errs.push(`Rule 0 ${h.kind}: ${h.match}`);
  if (text.length > before.length * 1.5 + 80) errs.push(`rewrite is ${text.length} chars against ${before.length}; at most one paragraph of light edits`);
  return errs;
}

function escapeJsx(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
}

/** Page source with the paragraph replaced by `text`, each token restored to its original code. */
export function renderRewrite(src: string, p: Paragraph, text: string): string {
  const bySource = new Map(p.segments.flatMap((s) => (s.kind === 'token' ? [[s.token, s.source] as const] : [])));
  const body = text
    .split(TOKEN_RE)
    .map((part, i) => (i % 2 === 1 ? bySource.get(part)! : p.mode === 'jsx' ? escapeJsx(part) : part))
    .join('');
  if (p.mode === 'template') return src.slice(0, p.start) + body + src.slice(p.end);
  const old = src.slice(p.start, p.end);
  const lead = old.match(/^\s*/)![0];
  const trail = old.match(/\s*$/)![0];
  // Keep the element's own line layout: content on one line between the original indents.
  const indent = lead.includes('\n') ? lead : '';
  const close = trail.includes('\n') ? trail : '';
  return src.slice(0, p.start) + indent + body + close + src.slice(p.end);
}
