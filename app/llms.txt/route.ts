import { getServerCount, getCategoryCount } from '@/lib/registry';
import { D3_REQUIRED_LABELS, D3_PROGRESS } from '@/lib/honest-limits';

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
- Pipeline (screen): today the screen is semantic-only — an LLM judge reads each tool description for hidden instructions. The deterministic conformance probe (drives the tool against its declared schema) is built but has NOT yet run on the public corpus, so no published screen verdict carries a conformance result; a clearing ALLOW (which the probe would earn) is not produced at v1 — the screen emits REVIEW or UNVERIFIED. When the probe runs it is monitored, not enforced. Confidence is reported but not yet calibrated (calibrated=false).
- History: OTS Bitcoin-anchored. Cadence bound = confirmation latency (~10 minutes for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized). Sub-window precision asserted, not proven. In-process verify proves the proof carries a Bitcoin BlockHeaderAttestation; confirmation-depth check is the relying party's job against their own Bitcoin node.
- Calibration: calibrated=false at v1. Confidences are reported, not yet calibrated against a held-out adversarial corpus.
- Exposure: anonymous calls return the current verdict (directive, status, dimension verdicts, severity, expires_at). Free, no key required - nothing on this API is paid-tier.
- Graduation gate (D3): >=${D3_REQUIRED_LABELS} conforming labels with FP upper-95 <=2%. Current: ${D3_PROGRESS}. Terminal-v1 trigger 2026-09-01: under 50 conforming = ships calibrated=false as terminal (v2 graduation, not v1).
- Deployment posture: advisory. mcpindex publishes the verdict; the agent or IDE decides whether to act on it.
- Full method: https://mcpindex.ai/methodology

## Drift Gate (in-path; tier-0 live, tiers 1-3 held off by default)

- What it is: an in-path trust gate for agent tool calls. It pins each MCP tool's contract trust-on-first-use (TOFU) and, before your agent acts, HOLDs the call the moment that contract silently changes. Unlike the advisory screen above, it sits in the call path, so it can HOLD, not merely alert.
- Method: a deterministic contract-diff (ChangeKind taxonomy: added-required-param, required-set-expanded, constraint-narrowed, type-changed, enum-values-removed, removed-param, annotation-flip-to-destructive, output-schema-added/changed, tool-added/removed), plus an injection/exfil marker scan over the input and output schema and description. Postures: Monitor (notify+proceed) / Guard (default; hold dangerous, auto-accept proven-benign) / Strict (hold any drift). Fail-closed.
- Install: one-click config-wire across Claude Desktop / Cursor / Cline / Zed (rewrites the host config to route each server through the gate; zero credentials change hands), or the SDK wrap() one-liner (TS + Python) around an already-authenticated session. See /docs.
- Tiered ladder: tier-0 deterministic contract-diff is the live, deterministic leg and runs first. Above it the ladder is built as in-path seams — a cloud tier-1 corpus lookup (a contract judged once clears or condemns it everywhere), a tier-2 LLM consult on the ambiguous, and a tier-3 behavioral verifier that exercises a changed tool to clear or refute the change — but each is held off by default and requires explicit opt-in; the default build egresses nothing and stays fail-closed.
- Honest limits: contract_diff_not_safety_verdict (a HOLD means the contract CHANGED vs your pin, not that the new contract is unsafe; when enabled, the behavioral tier clears or refutes a change, it does not prove a tool safe); tiers1to3_held_off_by_default_opt_in; default_build_egresses_nothing_fail_closed; calibrated_false_v1 (confidence reported but not yet calibrated against a held-out corpus).
- Status: tier-0 deterministic contract-diff is live and verified end-to-end against the live gate; tiers 1-3 are built but held off by default (opt-in).

## Blast-Radius Grade (in-path; advisory, on by default)

- What it is: alongside the contract-diff, the gate labels the blast radius of every tool call before your agent acts — what it would do (read, write, delete, send), whether it can be undone, and whether it leaves the machine. A read and an irreversible delete look identical to an agent until something labels them; this is that label.
- Method: a deterministic static classifier derived from the tool's own declared contract (name, description, input/output schema). It reads what a call WOULD do; it does not run the tool. Output is a typed action_type, side_effect_class, reversibility, and egress, plus a static autonomy ceiling (the most autonomy a call of this shape should get). Deny-by-construction: every field is a typed enum/hash/bool, so no raw argument value can ride along in the grade.
- Posture: advisory and fail-closed — when the contract is ambiguous it grades toward the more dangerous class (assumes a write/irreversible), never down.
- Where it runs: on by default in the published clients — @mcp-index/sdk (TypeScript) and mcpindex-preflight (Python). Deterministic, no network, no credentials.
- Honest limits: blast_radius_is_static_not_a_safety_verdict (it says what a call would do, read from the contract — not whether the contract is safe, and not what a specific call's runtime arguments will actually do); advisory_grade_orchestrator_decides (mcpindex labels the blast radius; your agent or IDE owns whether to allow, pause, or require approval).

## Drift Network (crawler-corroborated; warns you on call 1)

- What it is: mcpindex crawls the public MCP registry every day and records which tool contracts silently change. When you pin a tool, the gate can ask the network whether the crawler already caught that contract drifting — and warn you on the FIRST call, before a change you never saw burns you. A contract-diff advisory; it rides alongside the verdict and never moves PROCEED/HOLD.
- Opt-in: enable with MCPINDEX_DRIFT_TELEMETRY=detection (off by default). Under the same flag the gate emits one one-way salted-fingerprint signal on a pin/drift and queries the network; it never sends schemas, arguments, descriptions, URLs, or server/tool names.
- Corroboration is crawler-first: the public count floors at the crawler (sources=1), never forgeable install reports.
- Public proof: every drift the crawler catches is in the public drift ledger (/ledger).

## Whitepaper

- The trust-to-act layer for agent tool calls: the full architecture, threat model, tiered ladder, methodology, dogfood proof, and the honest limits (contract-diff not safety oracle; calibrated=false; tiers 1-3 held off by default).
- Public, free to read in full, with a free PDF (no email required): https://mcpindex.ai/whitepaper
- PDF: https://mcpindex.ai/whitepaper.pdf

## Endpoints an agent can call

- GET /api/v1/search?q=<query>                                   Keyword + semantic search across servers.
- GET /api/v1/recommend?task=<text>                              Natural language task -> top 3 servers with reasoning.
- GET /api/v1/preflight?task=<text>                              Pre-flight: top servers + the rank-1 server's advisory verdict in one call.
- GET /api/v1/diff?since=<YYYY-MM-DD>                            What changed in the registry since a date.
- GET /api/v1/drift/any?fp=<tool_fingerprint>                    Fleet drift query: has this tool's contract drifted (crawler-corroborated)? Powers "warns you on call 1". Returns {drifted, sources, safety_relevant}.
- GET /api/v1/ledger                                             Public drift ledger: contract changes the crawler observed (fingerprint-only; a contract-diff, not a safety verdict).
- GET /api/v1/trust/tool/<server_id>/<tool_name>                 Per-tool trust verdict (screened: real ALLOW/DENY/REVIEW; unscreened: UNVERIFIED, fail-closed; advisory).
- GET /api/v1/trust/server/<server_id>                           Server-level trust verdict (screened: real ALLOW/DENY/REVIEW; unscreened: UNVERIFIED, fail-closed; advisory).
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
- /ledger                   Public drift ledger: contract changes the crawler observed across public MCP servers.
- /dashboard                Drift network coverage + opt-in telemetry adoption (honest: opt-in counts are not all users).
- /changelog                Daily diff of registry changes.
- /changelog.rss            RSS 2.0 feed of the above.
- /methodology              The eval (semantic-only today; conformance probe built but not yet run), four-state verdict, honest limits.
- /whitepaper               The trust-to-act layer whitepaper: architecture, threat model, methodology, honest limits. Public; free PDF, no email wall.
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
