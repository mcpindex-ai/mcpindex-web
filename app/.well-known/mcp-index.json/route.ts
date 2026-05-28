import { getServerCount } from '@/lib/registry';

export const revalidate = 3600;

export async function GET() {
  const count = await getServerCount();
  const body = {
    name: 'mcpindex.ai',
    description:
      'Trust-to-act layer for agent tool use. Indexes MCP servers and publishes per-tool verdicts so an agent can check whether to invoke a tool before it acts.',
    version: '1',
    serversIndexed: count,
    upstream: 'https://registry.modelcontextprotocol.io',

    trust_layer: {
      capability: 'check_tool_trust',
      version: 'v1-advisory',
      verdict_contract_version: '1.0.0',
      verdict_states: ['allow', 'deny', 'review'],
      severity_scale: ['info', 'low', 'medium', 'high', 'critical'],
      exposure_tier: 'free_tier_is_definition_only_history_is_paid',
      methodology: 'https://mcpindex.ai/methodology',
      honest_limits: [
        'conformance_monitored_not_enforced',
        'ots_bitcoin_anchored_cadence_bound',
        'calibrated_false_v1',
        'definition_not_runtime',
        'advisory_not_blocking',
      ],
      endpoints: [
        'https://mcpindex.ai/api/v1/trust/tool/{server_id}/{tool_name}',
        'https://mcpindex.ai/api/v1/trust/server/{server_id}',
      ],
      d3_graduation: {
        criterion: 'conforming_labels >= 150 AND fp_upper_95 <= 0.02',
        current_conforming_labels: 15,
        current_fp_upper_95: null,
        status: 'pre_graduation',
      },
    },

    endpoints: {
      search: 'https://mcpindex.ai/api/v1/search?q={query}',
      recommend: 'https://mcpindex.ai/api/v1/recommend?task={natural_language}',
      diff: 'https://mcpindex.ai/api/v1/diff?since={YYYY-MM-DD}',
      detail: 'https://mcpindex.ai/server/{slug}',
      llmsTxt: 'https://mcpindex.ai/llms.txt',
      llmsFullTxt: 'https://mcpindex.ai/llms-full.txt',
      // Trust verdict endpoints. V1 advisory returns directive=UNVERIFIED for
      // every request; the API surface is plumbed so verdicts can flow once
      // the trust layer starts populating them.
      verdictTool: 'https://mcpindex.ai/api/v1/trust/tool/{server_id}/{tool_name}',
      verdictServer: 'https://mcpindex.ai/api/v1/trust/server/{server_id}',
    },

    docs: 'https://mcpindex.ai/docs',

    mcpServer: {
      package: 'mcp-server-mcpindex',
      registry: 'npm',
      tools: [
        'recommend_mcp_for_task',
        'search_mcp_servers',
        'get_install_command',
        'compare_servers',
        'check_tool_trust',
      ],
    },

    rateLimit: {
      anonymous: '60 req/min/IP',
      contact: 'hello@mcpindex.ai for higher limits',
    },

    affiliation: 'unofficial - not affiliated with Anthropic',
  };
  return Response.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
