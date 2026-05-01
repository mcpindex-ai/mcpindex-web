import { getServerCount, getCategoryCount } from '@/lib/registry';

export const revalidate = 3600;

export async function GET() {
  const [servers, categories] = await Promise.all([
    getServerCount(),
    getCategoryCount(),
  ]);
  const body = `# mcpindex.ai

The agent-native index of Model Context Protocol (MCP) servers.

Built for IDEs and agents that find the right MCP server at inference time, not the developer browsing a sidebar.

## Scale

- Servers indexed: ${servers}
- Categories: ${categories}
- Source: registry.modelcontextprotocol.io (canonical), enriched with quality scoring and semantic search.

## Endpoints an agent can call

- GET /api/v1/search?q=<query>           Keyword + semantic search across servers.
- GET /api/v1/recommend?task=<text>      Natural language task -> top 3 servers with reasoning.
- GET /api/v1/diff?since=<YYYY-MM-DD>    What changed in the registry since a date.
- GET /api/registry-count                Live server + category count.
- GET /llms-full.txt                     Full per-server index in one document.
- GET /.well-known/mcp-index.json        Machine-readable site capability descriptor.

## MCP server (drop-in)

\`\`\`bash
npm install -g mcp-server-mcpindex
\`\`\`

Add to Claude Desktop / Cursor / Cline / Zed and call \`recommend_mcp_for_task("read pdfs and write to s3")\`.

## Project pages

- /docs                     How it works, how to wire it into Claude/Cursor/Cline/Zed, response anatomy.
- /server/<slug>            Per-server detail (3,000+ pages, JSON-LD typed).
- /best/<category>          Curated picks per category.
- /leaderboard              Top 50 by MCP Quality Score.
- /changelog                Weekly diff of registry changes.
- /changelog.rss            RSS 2.0 feed of the above.
- /methodology              Open quality-score methodology.
- /about                    Project + founder.

Unofficial. Not affiliated with Anthropic.
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
