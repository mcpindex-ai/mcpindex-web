import type { MetadataRoute } from 'next';

// This app-router route is what is actually SERVED at /robots.txt (it shadows any
// static public/robots.txt). The site is intentionally open to every crawler,
// including AI/agent bots, so we list the major agent crawlers explicitly to signal
// intent even though `*` already allows them. The agent-readable index (llms.txt /
// llms-full.txt) is advertised via <link> tags and /.well-known/mcp-index.json —
// robots.ts cannot emit the free-form comment pointers the old static file carried.
const AI_CRAWLERS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'anthropic-ai',
  'PerplexityBot',
  'cohere-ai',
  'Google-Extended',
];

// The JSON API is not a page surface, and robots.txt carried no Disallow at all, so the
// whole thing was fair game to crawlers. Two distinct failures came out of that, both
// confirmed against the 2026-08-08 Search Console export rather than inferred:
//
//   1. Bare GETs on POST-only / parameter-required handlers answer 405 or 400. All three
//      URLs in "Blocked due to other 4xx issue" were exactly this: /api/v1/screen,
//      /api/v1/drift, /api/waitlist. Reached by crawl, not by guess — /docs links
//      /api/v1/recommend?task=… and /ledger and DriftReport both link /api/v1/ledger.
//   2. /api/v1/badge/* is an SVG endpoint that Google files as a page with no content.
//
// /api/v1/badge/* IS exempted, and the exemption is load-bearing — do not remove it to
// "tidy up" the API block. vercel.json already sends X-Robots-Tag: noindex on /api/(.*),
// shipped 2026-07-28, and the export shows that fix working: every badge URL crawled from
// 07-28 onward is in the clean "Excluded by noindex" bucket (53 of them, through 08-04),
// while the 45 still sitting in "Soft 404" and "Crawled - currently not indexed" were all
// last crawled ON OR BEFORE 07-28. The split at that date is total, with no exceptions.
// Those 45 are stale pre-fix crawls waiting to be re-evaluated. Disallowing the badge would
// make that re-evaluation impossible — Google cannot recrawl a blocked URL, so it can never
// see the noindex, and the 45 would be frozen in error buckets permanently. Worse, badge
// URLs are linked from third-party READMEs by design, and an externally-linked URL that is
// blocked rather than noindexed is exactly the recipe for "Indexed, though blocked by
// robots.txt". Blocking buys nothing either: only ~98 badge URLs have ever been crawled,
// so there is no meaningful crawl budget to reclaim.
//
// Per RFC 9309 the longest matching rule wins, so the badge Allow (14 chars) beats the
// /api/ Disallow (5) while /api/v1/screen does not. Encoded as one shared body because a
// user-agent group inherits nothing from the `*` group: a per-bot rule that omitted the
// Disallow would leave that bot crawling the API.
const RULE = { allow: ['/', '/api/v1/badge/'], disallow: ['/api/'] };

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', ...RULE },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, ...RULE })),
    ],
    sitemap: 'https://mcpindex.ai/sitemap.xml',
    host: 'https://mcpindex.ai',
  };
}
