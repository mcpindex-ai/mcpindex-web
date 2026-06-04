import { getServerCount } from '@/lib/registry';

export const revalidate = 3600;

export async function GET() {
  const count = await getServerCount();
  const body = {
    name: 'mcpindex.ai',
    description:
      'Trust-to-act layer for agent tool use. An in-path drift gate pins each MCP tool contract (TOFU) and HOLDs a call before the agent acts when the contract silently changes (a deterministic contract-diff, not a safety verdict); a public directory indexes MCP servers and publishes per-tool screening verdicts so an agent can check a tool before it wires it.',
    version: '1',
    serversIndexed: count,
    upstream: 'https://registry.modelcontextprotocol.io',

    trust_layer: {
      capability: 'check_tool_trust',
      version: 'v1-advisory',
      verdict_contract_version: '1.0.0',
      // UPPERCASE per the AD-B contract (contract-schema.md S3); UNVERIFIED
      // is the v1 default since the corpus is pre-graduation (15 of 150).
      verdict_states: ['ALLOW', 'DENY', 'REVIEW', 'UNVERIFIED'],
      severity_scale: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      exposure_tier: 'free_tier_is_definition_only_history_is_paid',
      methodology: 'https://mcpindex.ai/methodology',
      // v1 honest_limits floor. Endpoint adds `no_verdict_data_in_v1_advisory`
      // per-response while the corpus is empty; npm package may add an
      // `unverified_reason:<reason>` per-response when upstream is unreachable.
      // The floor here is the always-present set; per-response additions are
      // documented in contract-schema.md and integration-guide.md.
      // Literal (not imported): scripts/check-graduation-honesty.mjs statically
      // scans this file's source text for these tokens; an import would hide them.
      honest_limits: [
        'conformance_monitored_not_enforced',
        'calibrated_false_v1',
        'advisory_deployment',
      ],
      endpoints: [
        'https://mcpindex.ai/api/v1/trust/tool/{server_id}/{tool_name}',
        'https://mcpindex.ai/api/v1/trust/server/{server_id}',
      ],
      // INVARIANT: these are LABELED-conforming-corpus gate values (mirror of
      // mcpindex-trust/corpus_eval/GATES.json). They change ONLY when human-
      // labeled conforming tools + a probed FP upper-95 exist. Registry-screening
      // COVERAGE (data/verdicts.json) is a different axis and must NEVER raise
      // them. scripts/check-graduation-honesty.mjs fails the build if violated.
      d3_graduation: {
        criterion: 'conforming_labels >= 150 AND fp_upper_95 <= 0.02',
        current_conforming_labels: 15,
        current_fp_upper_95: null,
        status: 'pre_graduation',
        terminal_v1_trigger_date: '2026-09-01',
      },
    },

    // The in-path drift gate (the WEDGE you install). Deterministic contract-diff
    // is LIVE + dogfood-proven on Cursor; the full tiered ladder (tier-1 cloud
    // corpus, tier-2 LLM consult, tier-3 behavioral verifier) is live at launch.
    // The behavioral tier CLEARS or REFUTES a change - it is not a safety oracle,
    // and calibration is held (calibrated_false). honest_limits is literal (not
    // imported) so the build-time honesty guard can statically scan this file.
    drift_gate: {
      what: 'in-path trust gate for agent tool calls; pins each tool contract (TOFU) and HOLDs a call before the agent acts when the contract silently changes',
      method: 'deterministic contract-diff over a ChangeKind taxonomy + injection/exfil marker scan (input schema, output schema, description)',
      change_kinds: [
        'added-required-param',
        'required-set-expanded',
        'constraint-narrowed',
        'type-changed',
        'enum-values-removed',
        'removed-param',
        'annotation-flip-to-destructive',
        'output-schema-added',
        'output-schema-changed',
        'tool-added',
        'tool-removed',
      ],
      postures: ['monitor', 'guard', 'strict'],
      default_posture: 'guard',
      fail_mode: 'fail_closed',
      credential_custody: 'none - reuses the session the client already authenticated; reads only public tool contracts',
      install: {
        config_wire: ['claude_desktop', 'cursor', 'cline', 'zed'],
        sdk: ['typescript_wrap', 'python_wrap'],
        docs: 'https://mcpindex.ai/docs',
      },
      status: 'live_tiered_ladder_tier0_deterministic_dogfooded_on_cursor',
      tiers: [
        'tier0_deterministic_contract_diff',
        'tier1_cloud_corpus_lookup',
        'tier2_llm_consult',
        'tier3_behavioral_verifier',
      ],
      honest_limits: [
        'contract_diff_not_safety_verdict',
        'behavioral_tier_clears_or_refutes_not_safety_oracle',
        'calibrated_false_v1',
      ],
    },

    endpoints: {
      search: 'https://mcpindex.ai/api/v1/search?q={query}',
      recommend: 'https://mcpindex.ai/api/v1/recommend?task={natural_language}',
      // Pre-flight: discovery + the rank-1 server's advisory verdict in one call.
      preflight: 'https://mcpindex.ai/api/v1/preflight?task={natural_language}',
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
      version: '0.2.0',
      registry: 'npm',
      tools: [
        'recommend_mcp_for_task',
        'search_mcp_servers',
        'get_install_command',
        'compare_servers',
        'check_tool_trust',
        'assess_server',
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
