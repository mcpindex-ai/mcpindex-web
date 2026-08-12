import { getServerCount } from '@/lib/registry';
import { listScreened } from '@/lib/verdicts';
// Read the shipped version from the in-repo package (single source of truth) so this
// machine-readable descriptor can't drift from the real npm release — a stale version
// here is exactly the silent-drift this product exists to catch.
import { version as mcpServerVersion } from '../../../mcp-server-mcpindex/package.json';
import { VERDICT_CONTRACT_VERSION } from '@/lib/verdictContract';

export const revalidate = 3600;

export async function GET() {
  const [count, screened] = await Promise.all([getServerCount(), listScreened()]);
  // Derive the verdict-coverage note from the SAME getVerdict layer the live
  // /api/v1/trust route uses, so the machine descriptor can never drift from
  // the machine response. At v1 a screened server returns REVIEW (semantic-only);
  // everything else returns UNVERIFIED (fail-closed). ALLOW/DENY are reserved.
  const screenedCount = screened.length;
  const body = {
    name: 'mcpindex.ai',
    description:
      'In-path trust gate for agent tool calls. Pins each MCP tool contract (TOFU) and HOLDs a call before the agent acts when the contract silently changes (a deterministic contract-diff, not a safety verdict), and grades each call\'s blast radius - what it would do (read, write, delete, send) and whether it can be undone - read from the tool\'s declared contract (advisory and static, on by default in the clients). Secondary: a public directory indexes MCP servers and publishes per-tool advisory screening verdicts (REVIEW/UNVERIFIED at v1) so an agent can check a tool before it wires it.',
    version: '1',
    serversIndexed: count,
    upstream: 'https://registry.modelcontextprotocol.io',

    trust_layer: {
      capability: 'check_tool_trust',
      version: 'v1-advisory',
      verdict_contract_version: VERDICT_CONTRACT_VERSION,
      // UPPERCASE per the AD-B contract (contract-schema.md S3). At v1 a screened
      // server returns REVIEW (semantic-only); a server not on file returns
      // UNVERIFIED (fail-closed). ALLOW/DENY are reserved in the contract.
      // Coverage is advisory + semantic-only (labels to D3 graduation).
      verdict_states: ['ALLOW', 'DENY', 'REVIEW', 'UNVERIFIED'],
      verdict_coverage: {
        screened_servers: screenedCount,
        unscreened_returns: 'UNVERIFIED',
        // At v1 every published screen verdict is REVIEW or UNVERIFIED. The
        // deterministic conformance probe is built but has NOT run on this
        // corpus, so a clearing ALLOW (which the probe would earn) and an
        // automatic public DENY are not produced today. Keep this in sync with
        // /methodology and the honest_limits below.
        screen_conformance: 'built_not_yet_run_on_public_corpus_semantic_only',
        produced_decisions_at_v1: ['REVIEW', 'UNVERIFIED'],
        note: 'A screened server returns its real REVIEW (semantic-only) from the same getVerdict layer the website renders; an unscreened server returns UNVERIFIED (fail-closed). ALLOW/DENY are reserved in the contract but not produced at v1 - a conforming ALLOW requires the behavioral probe (D3 milestone). Coverage is advisory and semantic-only.',
      },
      severity_scale: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      exposure_tier: 'free_no_key_required',
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

    // The in-path drift gate (the WEDGE you install). Deterministic tier-0
    // contract-diff is LIVE (the deterministic leg). The tiers above it
    // (tier-1 cloud corpus, tier-2 LLM consult, tier-3 behavioral verifier) are
    // built as in-path seams but HELD OFF BY DEFAULT - each requires explicit
    // opt-in; the default build egresses nothing and stays fail-closed. The
    // behavioral tier CLEARS or REFUTES a change - it is not a safety oracle, and
    // calibration is held (calibrated_false). honest_limits is literal (not
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
        'param-mirrored-to-header',
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
        package: 'mcpindex-gate',
        config_wire: [
          'claude_desktop',
          'claude_code',
          'cursor',
          'gemini_cli',
          'cline',
          'zed',
          'windsurf',
          'vscode',
        ],
        sdk: ['typescript_wrap', 'python_wrap'],
        docs: 'https://mcpindex.ai/docs',
      },
      status: 'tier0_deterministic_live_verified_end_to_end; tiers1to3_built_held_off_by_default_opt_in',
      tiers: [
        { tier: 'tier0_deterministic_contract_diff', state: 'live' },
        { tier: 'tier1_cloud_corpus_lookup', state: 'held_off_by_default_opt_in' },
        { tier: 'tier2_llm_consult', state: 'held_off_by_default_opt_in' },
        { tier: 'tier3_behavioral_verifier', state: 'held_off_by_default_opt_in' },
      ],
      honest_limits: [
        'contract_diff_not_safety_verdict',
        'tiers1to3_held_off_by_default_opt_in',
        'default_build_egresses_nothing_fail_closed',
        'behavioral_tier_clears_or_refutes_not_safety_oracle',
        'calibrated_false_v1',
      ],
    },

    // The in-path blast-radius grade (shipped, on by default in the clients).
    // A deterministic STATIC classifier derived from the tool's declared
    // contract - it reads what a call WOULD do, it does not run the tool.
    // Advisory and fail-closed (grades toward the more dangerous class when the
    // contract is ambiguous). Deny-by-construction: every field is a typed
    // enum/hash/bool, so no raw argument value can ride along. honest_limits is
    // literal (not imported) so the build-time honesty guard can scan it.
    blast_radius: {
      what: 'labels the blast radius of each tool call before the agent acts: what it would do (read/write/delete/send), whether it can be undone, and whether it leaves the machine',
      method: 'deterministic static classifier over the tool\'s declared contract (name, description, input/output schema); does not run the tool',
      fields: ['action_type', 'side_effect_class', 'reversibility', 'egress', 'autonomy_ceiling'],
      fail_mode: 'fail_closed',
      ambiguity_posture: 'grades_up_assumes_more_dangerous_class',
      privacy: 'deny_by_construction - every field is a typed enum/hash/bool; no raw argument value is carried',
      default: 'on_by_default_in_published_clients',
      clients: ['@mcp-index/sdk (typescript)', 'mcpindex-gate (python)'],
      honest_limits: [
        'blast_radius_is_static_not_a_safety_verdict',
        'reads_what_a_call_would_do_not_runtime_arguments',
        'advisory_grade_orchestrator_decides',
      ],
    },

    endpoints: {
      // Hosted remote MCP server (Streamable HTTP) - connect any MCP client
      // without installing; exposes the 6 discovery + advisory-screen tools.
      mcp: 'https://mcpindex.ai/api/mcp',
      search: 'https://mcpindex.ai/api/v1/search?q={query}',
      recommend: 'https://mcpindex.ai/api/v1/recommend?task={natural_language}',
      // Pre-flight: discovery + the rank-1 server's advisory verdict in one call.
      preflight: 'https://mcpindex.ai/api/v1/preflight?task={natural_language}',
      diff: 'https://mcpindex.ai/api/v1/diff?since={YYYY-MM-DD}',
      // Fleet drift query (crawler-corroborated; powers "warns you on call 1").
      // Returns {drifted, sources, safety_relevant}; sources floors at 1 = the crawler.
      driftAny: 'https://mcpindex.ai/api/v1/drift/any?fp={tool_fingerprint}',
      // Public drift ledger: contract changes the crawler observed (fingerprint-only;
      // a contract-diff, not a safety verdict).
      driftLedger: 'https://mcpindex.ai/api/v1/ledger',
      detail: 'https://mcpindex.ai/server/{slug}',
      llmsTxt: 'https://mcpindex.ai/llms.txt',
      llmsFullTxt: 'https://mcpindex.ai/llms-full.txt',
      // Trust verdict endpoints. A screened server returns REVIEW (semantic-only)
      // at v1; an unscreened server returns UNVERIFIED (fail-closed). ALLOW/DENY
      // are reserved in the contract, not produced at v1. Advisory + semantic-only.
      verdictTool: 'https://mcpindex.ai/api/v1/trust/tool/{server_id}/{tool_name}',
      verdictServer: 'https://mcpindex.ai/api/v1/trust/server/{server_id}',
    },

    docs: 'https://mcpindex.ai/docs',

    // Machine-readable form of /terms "Using the data". Three tiers because three different
    // things are published here under three different terms, and conflating them would be a
    // false claim in one direction and a giveaway in the other: the registry mirror is not
    // ours to license, and the Zenodo deposits are already CC BY and must not be narrowed
    // here. Only the judgment layer is restricted, and only against BULK reconstruction —
    // querying, citing and linking stay explicitly permitted so an agent reading this never
    // has to guess whether normal use is allowed.
    license: {
      terms: 'https://mcpindex.ai/terms',
      registryMetadata: {
        covers: 'server names, descriptions, versions, install details',
        source: 'https://registry.modelcontextprotocol.io',
        rights: 'upstream_public_data - mcpindex claims none and grants none',
      },
      researchDatasets: {
        covers: 'published drift and screening datasets',
        source: 'https://zenodo.org',
        spdx: 'CC-BY-4.0',
        rights: 'reuse with attribution, commercial permitted, not narrowed by these terms',
      },
      judgmentLayer: {
        covers: 'screen verdicts, MCP Quality Score, drift ledger, source-liveness evidence',
        holder: 'Bhartis LLC',
        rights: 'noncommercial use with attribution',
        permitted: ['query via documented API', 'cite', 'link'],
        prohibited: ['bulk extraction to reconstruct or resell the dataset'],
        commercialLicense: 'hello@mcpindex.ai',
      },
    },

    mcpServer: {
      package: 'mcp-server-mcpindex',
      version: mcpServerVersion,
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

    integrations: [
      {
        framework: 'mastra',
        package: '@mcp-index/mastra',
        registry: 'npm',
        surface: 'beforeToolCall hook that calls check_tool_trust (advisory screen) before a tool runs; warn or enforce; fail-closed, no credentials',
      },
    ],

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
