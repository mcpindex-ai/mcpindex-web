import { getServerCount } from '@/lib/registry';

export const revalidate = 3600;

export async function GET() {
  const count = await getServerCount();
  const body = {
    name: 'mcpindex.ai',
    description: 'The agent-native index of MCP servers.',
    version: '1',
    serversIndexed: count,
    upstream: 'https://registry.modelcontextprotocol.io',
    endpoints: {
      search: 'https://mcpindex.ai/api/v1/search?q={query}',
      recommend: 'https://mcpindex.ai/api/v1/recommend?task={natural_language}',
      diff: 'https://mcpindex.ai/api/v1/diff?since={YYYY-MM-DD}',
      detail: 'https://mcpindex.ai/server/{slug}',
      llmsTxt: 'https://mcpindex.ai/llms.txt',
      llmsFullTxt: 'https://mcpindex.ai/llms-full.txt',
    },
    mcpServer: {
      package: 'mcp-server-mcpindex',
      registry: 'npm',
      tools: ['recommend_mcp_for_task', 'search_mcp_servers', 'get_install_command', 'compare_servers'],
    },
    rateLimit: {
      anonymous: '60 req/min/IP',
      contact: 'hello@mcpindex.ai for higher limits',
    },
    affiliation: 'unofficial — not affiliated with Anthropic',
  };
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
