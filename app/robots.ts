import type { MetadataRoute } from 'next';

// This app-router route is what is actually SERVED at /robots.txt (it shadows any
// static public/robots.txt). The site is intentionally open to every crawler,
// including AI/agent bots, so we list the major agent crawlers explicitly to signal
// intent even though `*` already allows them. The agent-readable index (llms.txt /
// llms-full.txt) is advertised via <link> tags and /.well-known/mcp-index.json —
// robots.ts cannot emit the free-form comment pointers the old static file carried.
//
// That openness is still the posture. The only exception is the three endpoints in
// GET_ANSWERS_4XX below, which are blocked because they answer a crawler's GET with an
// error, not because we want them private. Keep it that way: if you are about to add a
// Disallow, read the note above that constant first.
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

// Blocking is the LAST resort here, and the block is deliberately three paths wide rather
// than the whole API. Everything under /api/ already carries X-Robots-Tag: noindex from
// vercel.json (shipped 2026-07-28), and noindex is the better instrument wherever it can
// work: a crawler must be able to FETCH a URL to read the header telling it to drop that
// URL. Disallow prevents exactly that fetch. So the two are not interchangeable, and a
// Disallow laid over a noindex on a linked URL is strictly worse than the noindex alone —
// it strands whatever Google has already filed and invites "Indexed, though blocked by
// robots.txt" on anything with inbound links.
//
// These three are the exception because noindex CANNOT work on them: a bare GET answers
// 405/400, and a crawl error is filed before any response header is evaluated. They are
// also the complete contents of Search Console's "Blocked due to other 4xx issue" bucket
// as of the 2026-08-08 export, and none of them is linked from anywhere in the app — they
// were discovered from the endpoint list in /llms.txt, which is text, not anchors.
//
// $-anchored, and that anchor is load-bearing on the middle one: /api/v1/drift has child
// routes (any, oauth, register) and /api/v1/drift/any is advertised to agents at
// app/llms.txt/route.ts:129. An unanchored /api/v1/drift prefix would silently block it.
const GET_ANSWERS_4XX = ['/api/v1/screen$', '/api/v1/drift$', '/api/waitlist$'];

// Everything else under /api/ stays crawlable ON PURPOSE, in two directions:
//
//   Search — /docs links /api/v1/recommend?task=… (200) and /ledger and DriftReport both
//   link /api/v1/ledger (200). Those are internally linked, so blocking them is the
//   linked-but-blocked trap described above. noindex already handles them, which is what
//   e75e6b2 chose on 2026-07-28 and recorded as "still crawlable".
//
//   Agents — /llms.txt:124-132 publishes POST /api/mcp plus eight GET /api/v1/* endpoints
//   as the agent-facing contract, and :143 tells MCP clients to point at /api/mcp.
//   /.well-known/mcp-index.json republishes the same list. Handing an agent crawler a
//   document that advertises endpoints its robots.txt forbids is incoherent, and
//   lib/apiUsage.ts counts /api/mcp and /api/v1/preflight as a tracked metric.
//
// /api/v1/badge/* is included in that "stays crawlable" set, and it is the one people will
// be tempted to close, because it dominates the error buckets. Do not. The 08-08 export
// splits cleanly on 2026-07-28, the day the noindex shipped: every badge URL crawled on or
// after that date is in the clean "Excluded by noindex" bucket (53, through 08-04), and
// every one still in "Soft 404"/"Crawled - not indexed" (45) was last crawled on or before
// it. Those 45 are stale crawls awaiting re-evaluation, and only a recrawl can reclassify
// them. Badge URLs are also linked from third-party READMEs by design — the worst possible
// candidate for blocked-not-noindexed.
//
// Shared body because a user-agent group inherits nothing from the `*` group.
const RULE = { allow: ['/'], disallow: GET_ANSWERS_4XX };

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
