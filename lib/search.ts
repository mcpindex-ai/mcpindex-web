// Lightweight BM25-ish keyword search. Works without API keys.
// When OPENAI_API_KEY is set + an embedding index exists, search.ts can be
// upgraded to semantic — leave that as a v2 cron-driven enhancement.

import type { IndexedServer } from './types';

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','in','on','at','to','for','of','with',
  'by','as','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','must','can',
  'this','that','these','those','i','me','my','you','your','he','she','it',
  'we','us','our','they','them','their','what','which','who','how','why',
  'mcp','server','servers','that','any','some','all'
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
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

  const scored = servers
    .filter((s) => !opts.categoryFilter || s.category === opts.categoryFilter)
    .map((s) => {
      const haystack = `${s.name} ${s.title} ${s.description} ${s.category}`.toLowerCase();
      const matched = new Set<string>();
      let score = 0;

      for (const term of queryTokens) {
        const inTitle = s.title.toLowerCase().includes(term);
        const inName = s.name.toLowerCase().includes(term);
        const inDesc = s.description.toLowerCase().includes(term);
        const inCategory = s.category.includes(term);

        if (inTitle) { score += 5; matched.add(term); }
        if (inName) { score += 4; matched.add(term); }
        if (inCategory) { score += 3; matched.add(term); }
        if (inDesc) {
          // Count occurrences for some recency weighting.
          const count = (haystack.match(new RegExp(`\\b${term}\\b`, 'g')) ?? []).length;
          score += Math.min(count * 1.5, 6);
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
