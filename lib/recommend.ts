// Shared composite ranker for /api/v1/recommend and the internal
// /api/v1/preflight BFF. One source of truth so the directory ranking and the
// pre-flight verdict gate always agree on which server is rank-1.
//
// Composite is relevance-dominant: keyword search score leads, MCP Quality Score
// contributes a small tiebreak (QS*0.1). The slug tiebreaker keeps repeated
// identical queries byte-identical (cache-friendly).

import type { IndexedServer } from './types';
import { search, type SearchHit } from './search';
import { computeQuality } from './quality';

export type RankedServer = { hit: SearchHit; quality: number; composite: number };

export type Recommendation = {
  rank: number;
  slug: string;
  name: string;
  title: string;
  description: string;
  category: string;
  qualityScore: number;
  reasoning: string;
  installs: { npm?: string; pypi?: string; docker?: string; remote?: string };
  url: string;
};

export function rankServers(
  servers: IndexedServer[],
  task: string,
  limit = 3,
): RankedServer[] {
  const hits = search(servers, task, { limit: 10 });
  return hits
    .map((hit) => {
      const quality = computeQuality(hit.server).score;
      // Relevance-dominant: search score leads; QS*0.1 (0-10, ~1.5 term-fields)
      // only breaks ties between near-equal-relevance servers. QS is 0-100, so
      // the old 0.3*QS swamped the small search score and floated generic
      // high-QS servers to rank-1 (validated 2026-06-01, held-out intent set).
      const composite = hit.score + quality * 0.1;
      return { hit, quality, composite };
    })
    .sort((a, b) => {
      if (b.composite !== a.composite) return b.composite - a.composite;
      // Deterministic tiebreaker so repeated identical queries return
      // byte-identical responses (search order independent of map iteration).
      return a.hit.server.slug.localeCompare(b.hit.server.slug);
    })
    .slice(0, limit);
}

export function buildReasoning(hit: SearchHit): string {
  const matched = hit.matchedTerms.length;
  const cat = hit.server.category;
  if (matched >= 2) {
    return `Matches ${hit.matchedTerms.join(', ')} in title/description; category: ${cat}.`;
  }
  if (matched === 1) {
    return `Matches "${hit.matchedTerms[0]}" in ${cat}-category server.`;
  }
  return `Closest fit in ${cat} category by description overlap.`;
}

export function toRecommendations(ranked: RankedServer[]): Recommendation[] {
  return ranked.map(({ hit, quality }, i) => ({
    rank: i + 1,
    slug: hit.server.slug,
    name: hit.server.name,
    title: hit.server.title,
    description: hit.server.description,
    category: hit.server.category,
    qualityScore: quality,
    reasoning: buildReasoning(hit),
    installs: {
      npm: hit.server.npmPackage,
      pypi: hit.server.pypiPackage,
      docker: hit.server.dockerImage,
      remote: hit.server.remoteUrl,
    },
    url: `https://mcpindex.ai/server/${hit.server.slug}`,
  }));
}
