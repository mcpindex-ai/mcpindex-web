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
//
// v1.2 (2026-08-14):
//   O4  a plural query token also matches its singular as a whole word, so
//       "pdfs" reaches a server named "pdf". O2' prefix matching only ever ran
//       singular->plural.
//
// v1.3 (2026-08-18): canonical-first ranking. A 163-name demand spot check
// (tasks/mcpindex-reddit-spotcheck-2026-08-18.md, GBCode workspace) found the
// official GitHub server absent from the top 5 for ?q=github while a wrapper
// ranked #1; same for stripe/filesystem/memory. Cause: text relevance alone
// cannot separate a verified vendor from a name-squatter, and 9 of 14,198
// publishers (>=100 servers each, median 1) flood head queries by volume.
//   O5  vendor-namespace boost: the registry verifies namespace ownership
//       (GitHub auth for io.github.*, DNS for domain namespaces), so a query
//       token equal to the namespace's org label (io.github.github, com.stripe,
//       app.linear) is an authenticity signal a squatter cannot copy.
//   O6  exact product-name boost, strictly below O5: "context7" the query
//       matching "context7" the product beats "context7docs-mcp", but a squatter
//       whose PRODUCT is named exactly "github" still loses to the verified
//       io.github.github namespace.
//   O7  reference-org prior: io.github.modelcontextprotocol's servers carry
//       generic names (server-filesystem, server-memory) no publisher can own
//       as a token; a flat boost keeps the reference implementations above
//       lookalikes.
//   O8  mass-publisher dampener: publishers at >=100 servers (9 of 14,198 in
//       the 2026-08-18 snapshot; median is 1) pay a small flat penalty unless
//       O5 fired for them. Volume is how squat farms win ties.

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

// O4: strip one unambiguous English plural "s" so a plural QUERY token can still
// reach a singular-named server. Deliberately narrow - "ss"/"us"/"is" endings
// ("access", "status", "analysis") are not plurals, and the >=4 floor keeps
// 3-char tokens like "aws"/"gcs"/"ops" whole, where a stem would be pure noise.
function singular(term: string): string | null {
  if (term.length < 4 || !term.endsWith('s')) return null;
  if (/(?:ss|us|is)$/.test(term)) return null;
  return term.slice(0, -1);
}

// O2': <=2-char tokens match as whole words (\bpr\b: "PR" not "preview").
// Longer tokens match at a word START (\bdrive): "drive"/"drives"/"google-drive"
// and "sheet"->"sheets", but NOT mid-word ("drive" in "pipedrive").
//
// O4: prefix matching is one-directional - `\bsheet` reaches "sheets", but
// `\bpdfs` never reaches "pdf" - so a user typing the natural plural silently
// missed the canonical servers (observed: ?q=pdfs returned pdfspark/pdfslim but
// NOT io.pdfbroker/pdf or mcp-pdf). The singular alternative is matched as a
// WHOLE WORD, not a prefix: folding "docs" down to a bare `\bdoc` prefix would
// newly match "docker"/"document", buying recall with precision. `\b(?:docs|doc\b)`
// reaches "docs", "docsend" and the standalone word "doc", and still never
// matches "docker".
function source(term: string): string {
  const e = esc(term);
  if (term.length <= 2) return `\\b${e}\\b`;
  const stem = singular(term);
  return stem === null ? `\\b${e}` : `\\b(?:${e}|${esc(stem)}\\b)`;
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

// ---------------------------------------------------------------- v1.3 helpers

const VENDOR_NS_BOOST = 10; // O5: must stay strictly above EXACT_NAME_BOOST
const EXACT_NAME_BOOST = 6; // O6
const REFERENCE_BOOST = 6; // O7
const REFERENCE_PUBLISHER = 'io.github.modelcontextprotocol';
const MASS_PUBLISHER_MIN = 100; // O8: catches 9 publishers in the 2026-08-18 snapshot
const MASS_PUBLISHER_PENALTY = 2;

function namespaceOf(name: string): string {
  const slash = name.indexOf('/');
  return (slash >= 0 ? name.slice(0, slash) : name).toLowerCase();
}

// O5: the org label is the namespace segment the registry actually verifies -
// the GitHub owner for io.github.*, the second domain label otherwise
// (com.stripe -> "stripe"). Hyphens are dropped so "browser-use" can equal the
// joined query tokens ("browser use" tokenizes to two words).
// Vendors commonly suffix their org handle (tavily-ai, mongodb-js,
// Snowflake-Labs). Both the raw label and the suffix-stripped variant are
// candidates, so "tavily" reaches io.github.tavily-ai while a vendor literally
// named with such an ending keeps its raw identity. The suffix must be
// hyphen-separated: stripping a bare "ai" ending would turn "openai" into
// "open" and hand the boost to the wrong query. Known spoof vector: anyone can
// register a GitHub org named "<vendor>-ai" - accepted because it costs an org
// registration per squat instead of a repo name, and the boost only reorders
// results that already matched the query text.
function orgLabels(name: string): string[] {
  const parts = namespaceOf(name).split('.');
  const label = (parts[0] === 'io' && parts[1] === 'github' ? parts[2] : parts[1]) ?? parts[0];
  const stripped = label.replace(/-(?:ai|io|js|labs|hq)$/, '');
  const flat = label.replace(/-/g, '');
  const flatStripped = stripped.replace(/-/g, '');
  return flat === flatStripped ? [flat] : [flat, flatStripped];
}

// O8: group by what a publisher controls, not the full namespace - squat farms
// that mint one namespace per product (com.x.producta, com.x.productb) collapse
// to one key; io.github.* keys on the owner so unrelated GitHub users stay apart.
function publisherKey(name: string): string {
  const parts = namespaceOf(name).split('.');
  const depth = parts[0] === 'io' && parts[1] === 'github' ? 3 : 2;
  return parts.slice(0, depth).join('.');
}

// Recomputing 22k publisher counts per request would dominate search cost;
// loadServers() memoises its array, so a WeakMap keyed on that identity makes
// this a one-time cost per corpus generation.
const publisherCountsCache = new WeakMap<IndexedServer[], Map<string, number>>();

function publisherCounts(servers: IndexedServer[]): Map<string, number> {
  const cached = publisherCountsCache.get(servers);
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const s of servers) {
    const key = publisherKey(s.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  publisherCountsCache.set(servers, counts);
  return counts;
}

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
  const joinedQuery = queryTokens.join('');
  const counts = publisherCounts(servers);

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

      // v1.3 (O5-O8): authenticity signals, applied only to text-relevant hits.
      if (matched.size > 0) {
        const labels = orgLabels(s.name);
        const vendorOwned = labels.some(
          (label) => label === joinedQuery || queryTokens.includes(label),
        );
        if (vendorOwned) {
          score += VENDOR_NS_BOOST;
        } else if ((counts.get(publisherKey(s.name)) ?? 0) >= MASS_PUBLISHER_MIN) {
          score -= MASS_PUBLISHER_PENALTY;
        }
        // "server-memory", "mcp-pdf" and "tavily-mcp" are exact names for their
        // subject under the ecosystem's naming conventions; without the strip,
        // a squatter who names a product literally "memory" outscores the
        // reference server.
        const bareName = cleanName
          .replace(/^(?:mcp-)?(?:server-)?/, '')
          .replace(/(?:-mcp)?(?:-server)?$/, '')
          .replace(/-/g, '');
        if (bareName === joinedQuery) score += EXACT_NAME_BOOST;
        if (namespaceOf(s.name) === REFERENCE_PUBLISHER) score += REFERENCE_BOOST;
      }

      // Tiebreaker: shorter description wins (more focused)
      if (score > 0) score += Math.max(0, 3 - s.description.length / 200);

      return { server: s, score, matchedTerms: [...matched] };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}
