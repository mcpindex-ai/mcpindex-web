import { getServerCount, getCategoryCount } from '@/lib/registry';

export const revalidate = 3600;

export async function GET() {
  const [servers, categories] = await Promise.all([
    getServerCount(),
    getCategoryCount(),
  ]);
  const body = `# mcpindex.ai

The trust-to-act layer for agent tool use. Every MCP server gets an indexed page; per-tool verdicts roll out as the eval harness covers them.

Built so an agent (or the IDE driving one) can ask "should I invoke this tool" before it calls, not after.

## Scale

- Servers indexed: ${servers}
- Categories: ${categories}
- Source: registry.modelcontextprotocol.io (canonical), enriched with quality scoring, semantic search, and trust verdicts.

## Trust Layer (v1, advisory)

- Verdict contract: 1.0.0 (ALLOW / DENY / REVIEW / UNVERIFIED, severity INFO..CRITICAL).
- Capability: check_tool_trust (exposed by the npm MCP server, see below).
- Pipeline: an LLM judge reads each tool description for hidden instructions, and a deterministic conformance probe drives the tool against its declared schema. Conformance is monitored, not enforced; confidence is reported but not yet calibrated (calibrated=false).
- History: OTS Bitcoin-anchored. Cadence bound = confirmation latency (~10 minutes for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized). Sub-window precision asserted, not proven. In-process verify proves the proof carries a Bitcoin BlockHeaderAttestation; confirmation-depth check is the relying party's job against their own Bitcoin node.
- Calibration: calibrated=false at v1. Confidences are reported, not yet calibrated against a held-out adversarial corpus.
- Exposure: anonymous calls return the current verdict (directive, status, dimension verdicts, severity, expires_at). History is paid-tier only.
- Graduation gate (D3): >=150 conforming labels with FP upper-95 <=2%. Current: 15/150. Terminal-v1 trigger 2026-09-01: under 50 conforming = ships calibrated=false as terminal (v2 graduation, not v1).
- Deployment posture: advisory. mcpindex publishes the verdict; the agent or IDE decides whether to act on it.
- Full method: https://mcpindex.ai/methodology

## Drift Gate (in-path, live)

- What it is: an in-path trust gate for agent tool calls. It pins each MCP tool's contract trust-on-first-use (TOFU) and, before your agent acts, HOLDs the call the moment that contract silently changes. Unlike the advisory screen above, it sits in the call path, so it can HOLD, not merely alert.
- Method: a deterministic contract-diff (ChangeKind taxonomy: added-required-param, required-set-expanded, constraint-narrowed, type-changed, enum-values-removed, removed-param, annotation-flip-to-destructive, output-schema-added/changed, tool-added/removed), plus an injection/exfil marker scan over the input and output schema and description. Postures: Monitor (notify+proceed) / Guard (default; hold dangerous, auto-accept proven-benign) / Strict (hold any drift). Fail-closed.
- Install: one-click config-wire across Claude Desktop / Cursor / Cline / Zed (rewrites the host config to route each server through the gate; zero credentials change hands), or the SDK wrap() one-liner (TS + Python) around an already-authenticated session. See /docs.
- Tiered ladder: tier-0 deterministic contract-diff runs first; above it the cloud tier-1 corpus lookup (a contract judged once clears or condemns it everywhere), a tier-2 LLM consult on the ambiguous, and a tier-3 behavioral verifier that exercises a changed tool to clear or refute the change.
- Honest limits: contract_diff_not_safety_verdict (a HOLD means the contract CHANGED vs your pin, not that the new contract is unsafe; the behavioral tier clears or refutes a change, it does not prove a tool safe); calibrated_false_v1 (confidence reported but not yet calibrated against a held-out corpus).
- Status: deterministic contract-diff dogfood-proven on Cursor; the full tiered ladder is live.

## Endpoints an agent can call

- GET /api/v1/search?q=<query>                                   Keyword + semantic search across servers.
- GET /api/v1/recommend?task=<text>                              Natural language task -> top 3 servers with reasoning.
- GET /api/v1/preflight?task=<text>                              Pre-flight: top servers + the rank-1 server's advisory verdict in one call.
- GET /api/v1/diff?since=<YYYY-MM-DD>                            What changed in the registry since a date.
- GET /api/v1/trust/tool/<server_id>/<tool_name>                 Per-tool trust verdict (v1 advisory returns UNVERIFIED).
- GET /api/v1/trust/server/<server_id>                           Server-level trust verdict (v1 advisory returns UNVERIFIED).
- GET /api/registry-count                                        Live server + category count.
- GET /llms-full.txt                                             Full per-server index in one document.
- GET /.well-known/mcp-index.json                                Machine-readable site + trust-layer capability descriptor.

## MCP server (drop-in)

\`\`\`bash
npm install -g mcp-server-mcpindex
\`\`\`

Add to Claude Desktop / Cursor / Cline / Zed. Three primary calls:

- recommend_mcp_for_task("read pdfs and write to s3")        -> discovery
- check_tool_trust(server_id="<id>", tool_name="<name>")     -> per-tool trust verdict (advisory)
- assess_server(server_id="<id>")                            -> server-level trust verdict (advisory)

## Project pages

- /docs                     How it works, how to wire it into Claude/Cursor/Cline/Zed, response anatomy.
- /server/<slug>            Per-server detail (${servers} pages, JSON-LD typed, verdict surfaced when available).
- /guides                   Practical guides: trust/security reviews, comparisons, integration how-tos.
- /guides/<slug>            Individual guide (intent pages grounded in registry + trust data).
- /best/<category>          Curated picks per category.
- /leaderboard              Top 50 by MCP Quality Score.
- /changelog                Daily diff of registry changes.
- /changelog.rss            RSS 2.0 feed of the above.
- /methodology              Hybrid eval, four-state verdict, honest limits.
- /about                    Why this exists.

Unofficial. Not affiliated with Anthropic.
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
