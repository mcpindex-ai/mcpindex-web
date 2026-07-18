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

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: 'https://mcpindex.ai/sitemap.xml',
    host: 'https://mcpindex.ai',
  };
}
