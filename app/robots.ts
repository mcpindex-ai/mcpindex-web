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
//   2. /api/v1/badge/* is an SVG endpoint, and it accounted for ALL 26 "Soft 404" URLs
//      plus 53 of the 66 "Excluded by noindex" — 79 error-bucket entries from one route.
//
// The badge is NOT exempted, despite being embedded as an <img> in third-party READMEs.
// robots.txt binds crawlers, not browsers, and GitHub proxies README images through camo
// without consulting it, so nothing that actually renders a badge is affected. The only
// thing given up is Google Images indexing of badge SVGs. What is bought is real: the
// corpus is crawl-starved (11,687 URLs sit in "Discovered - currently not indexed"), and
// leaving a per-server image endpoint open invited crawl against ~20k badge URLs that can
// never be a search result. vercel.json already sends X-Robots-Tag: noindex on /api/(.*),
// which is what emptied those 53 — this stops the crawl from being spent in the first place.
//
// Encoded as one shared body because a user-agent group inherits nothing from the `*`
// group: a per-bot rule that omitted the Disallow would leave that bot crawling the API.
const RULE = { allow: ['/'], disallow: ['/api/'] };

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
