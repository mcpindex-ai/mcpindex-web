// Lightweight BM25-ish keyword search. Works without API keys.
// When OPENAI_API_KEY is set + an embedding index exists, search.ts can be
// upgraded to semantic - leave that as a v2 cron-driven enhancement.
//
// v1.1 (validated on a held-out intent set, 2026-06-01):
//   O1  strip the reverse-DNS hosting prefix from the searchable name, so a
//       query token like "github" stops matching every io.github.* server.
//   O2' word-boundary match for <=2-char tokens ("pr","s3","db") so they match
//       as whole words, not substrings of "preview"/"process"; longer tokens
//       keep stem-tolerant substring so "sheet" still matches "sheets".
//   O3  drop pure action verbs (create/update/get/...) that only match tool-name
//       nouns like "create-web-page". (Rank-side QS weighting lives in
//       lib/recommend.ts.)

import type { IndexedServer } from './types';

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','in','on','at','to','for','of','with',
  'by','as','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','must','can',
  'this','that','these','those','i','me','my','you','your','he','she','it',
  'we','us','our','they','them','their','what','which','who','how','why',
  'mcp','server','servers','that','any','some','all',
]);

// O3: pure action verbs that match tool-name nouns and add only noise. Kept
// deliberately small - excludes search/query/upload/read/list/fetch, which are
// real capabilities a server can be named for.
const VERB_STOP = new Set([
  'create','update','manage','get','open','send','run','make','set','put','call',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t) && !VERB_STOP.has(t));
}

// O1: keep the product/repo segment, drop the reverse-DNS hosting prefix.
// "io.github.owner/repo" -> "repo"; "com.vendor/product" -> "product".
export function searchableName(name: string): string {
  const slash = name.lastIndexOf('/');
  if (slash >= 0) return name.slice(slash + 1);
  return name.replace(/^(io|com|net|org|ai|dev|app|co|gg|sh)\.[a-z0-9_-]+\./i, '');
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// O2': <=2-char tokens match as whole words (\bpr\b: "PR" not "preview").
// Longer tokens match at a word START (\bdrive): "drive"/"drives"/"google-drive"
// and "sheet"->"sheets", but NOT mid-word ("drive" in "pipedrive").
function source(term: string): string {
  const e = esc(term);
  return term.length <= 2 ? `\\b${e}\\b` : `\\b${e}`;
}

// A query token compiled once per request: `test` is non-global (reused across
// fields/servers safely - .test() on a non-global regex ignores lastIndex);
// `count` is global for occurrence counting (String.match resets lastIndex).
type CompiledTerm = { term: string; test: RegExp; count: RegExp };

function compile(tokens: string[]): CompiledTerm[] {
  return tokens.map((term) => {
    const src = source(term);
    return { term, test: new RegExp(src), count: new RegExp(src, 'g') };
  });
}

export type SearchHit = {
  server: IndexedServer;
  score: number;
  matchedTerms: string[];
};

export function search(
  servers: IndexedServer[],
  query: string,
  opts: { limit?: number; categoryFilter?: string } = {},
): SearchHit[] {
  const limit = opts.limit ?? 20;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Compile each token's regexes ONCE per request, not per server (~10k).
  const terms = compile(queryTokens);

  const scored = servers
    .filter((s) => !opts.categoryFilter || s.category === opts.categoryFilter)
    .map((s) => {
      const cleanName = searchableName(s.name).toLowerCase();
      const title = s.title.toLowerCase();
      const desc = s.description.toLowerCase();
      const category = s.category.toLowerCase();
      const matched = new Set<string>();
      let score = 0;

      for (const { term, test, count } of terms) {
        if (test.test(title)) { score += 5; matched.add(term); }
        if (test.test(cleanName)) { score += 4; matched.add(term); }
        if (test.test(category)) { score += 3; matched.add(term); }
        if (test.test(desc)) {
          // Count occurrences for some recency weighting.
          score += Math.min((desc.match(count) ?? []).length * 1.5, 6);
          matched.add(term);
        }
      }

      // Bonus when most query terms hit
      score += matched.size === queryTokens.length ? 5 : 0;

      // Tiebreaker: shorter description wins (more focused)
      if (score > 0) score += Math.max(0, 3 - s.description.length / 200);

      return { server: s, score, matchedTerms: [...matched] };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}
