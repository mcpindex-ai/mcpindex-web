import { getServerCount, getCategoryCount } from '@/lib/registry';
import { D3_REQUIRED_LABELS, D3_PROGRESS } from '@/lib/honest-limits';
import { gateInstallLine } from '@/lib/install/manifest';
import { recordAeoFetch } from '@/lib/aeoCounter';

// Uncached for the AEO measurement window so every fetch invokes the function (see lib/aeoCounter.ts).
// The counter is per-isolate/per-minute deduped, so it records ACTIVE-MINUTES (presence), not raw hits —
// no-store here means /llms.txt catches every distinct active minute per family (finer than /llms-full's
// s-maxage=60 floor), not raw fetch volume. REVERT after the window: restore `revalidate = 3600` and the
// `s-maxage=3600` Cache-Control below.
export const revalidate = 0;

export async function GET(req: Request) {
  // Only GET is counted: Next 16 auto-implements HEAD from GET, which would otherwise double-count.
  // Fire-and-forget (not awaited) so the counter adds zero TTFB. The synchronous console.log inside
  // recordAeoFetch is the RELIABLE read path (always lands pre-response); the un-awaited Upstash write
  // is best-effort — initiated synchronously but may be dropped if the isolate freezes post-response
  // (fail-open, per-minute-deduped, self-heals next minute). recordAeoFetch never rejects.
  if (req.method === 'GET') void recordAeoFetch('llms', req.headers.get('user-agent'));
  const [servers, categories] = await Promise.all([
    getServerCount(),
    getCategoryCount(),
  ]);
  const body = `# mcpindex.ai

> The in-path trust gate for agent tool calls. Pins each MCP tool contract and HOLDs the call when it silently drifts - before your agent acts. Zero credentials. Fail-closed. Not a safety oracle.

Secondary: a public directory of MCP servers with advisory screening verdicts (REVIEW / UNVERIFIED at v1) so you can check a tool before you wire it.

## Scale

- How many MCP servers are there? ${servers} active, latest-version entries in the official registry (methodology + live count: [mcpindex.ai/stats](https://mcpindex.ai/stats)).
- Categories: ${categories}
- Source: registry.modelcontextprotocol.io (canonical), enriched with quality scoring, semantic search, and advisory screen verdicts. Delisted and superseded versions are excluded so the same server never counts twice.

## Drift Gate (in-path; tier-0 live, tiers 1-3 held off by default)

- What it is: an in-path trust gate for agent tool calls. It pins each MCP tool's contract trust-on-first-use (TOFU) and, before your agent acts, HOLDs the call the moment that contract silently changes. Unlike the advisory screen below, it sits in the call path, so it can HOLD, not merely alert.
- Method: a deterministic contract-diff (ChangeKind taxonomy: added-required-param, required-set-expanded, constraint-narrowed, type-changed, enum-values-removed, removed-param, annotation-flip-to-destructive, output-schema-added/changed, tool-added/removed), plus an injection/exfil marker scan over the input and output schema and description. Postures: Monitor (notify+proceed) / Guard (default; hold dangerous, auto-accept proven-benign) / Strict (hold any drift). Fail-closed.
- ${gateInstallLine({ code: true })}
- Tiered ladder: tier-0 deterministic contract-diff is the live, deterministic leg and runs first. Above it the ladder is built as in-path seams - a cloud tier-1 corpus lookup (a contract judged once clears or condemns it everywhere), a tier-2 LLM consult on the ambiguous, and a tier-3 behavioral verifier that exercises a changed tool to clear or refute the change - but each is held off by default and requires explicit opt-in; the default build egresses nothing and stays fail-closed.
- Honest limits: contract_diff_not_safety_verdict (a HOLD means the contract CHANGED vs your pin, not that the new contract is unsafe; when enabled, the behavioral tier clears or refutes a change, it does not prove a tool safe); tiers1to3_held_off_by_default_opt_in; default_build_egresses_nothing_fail_closed; calibrated_false_v1 (confidence reported but not yet calibrated against a held-out corpus).
- Status: tier-0 deterministic contract-diff is live and verified end-to-end against the live gate; tiers 1-3 are built but held off by default (opt-in).

## Blast-Radius Grade (in-path; advisory, on by default)

- What it is: alongside the contract-diff, the gate labels the blast radius of every tool call before your agent acts - what it would do (read, write, delete, send), whether it can be undone, and whether it leaves the machine. A read and an irreversible delete look identical to an agent until something labels them; this is that label.
- Method: a deterministic static classifier derived from the tool's own declared contract (name, description, input/output schema). It reads what a call WOULD do; it does not run the tool. Output is a typed action_type, side_effect_class, reversibility, and egress, plus a static autonomy ceiling (the most autonomy a call of this shape should get). Deny-by-construction: every field is a typed enum/hash/bool, so no raw argument value can ride along in the grade.
- Posture: advisory and fail-closed - when the contract is ambiguous it grades toward the more dangerous class (assumes a write/irreversible), never down.
- Where it runs: on by default in the published clients - @mcp-index/sdk (TypeScript) and mcpindex-gate (Python). Deterministic, no network, no credentials.
- Honest limits: blast_radius_is_static_not_a_safety_verdict (it says what a call would do, read from the contract - not whether the contract is safe, and not what a specific call's runtime arguments will actually do); advisory_grade_orchestrator_decides (mcpindex labels the blast radius; your agent or IDE owns whether to allow, pause, or require approval).

## Advisory directory screen (v1)

- Verdict contract: 1.0.0 (states ALLOW / DENY / REVIEW / UNVERIFIED; severity INFO..CRITICAL). At v1 the public screen produces REVIEW or UNVERIFIED only - ALLOW and DENY are reserved in the contract, not emitted today.
- Capability: check_tool_trust (exposed by the npm MCP server, see below). This is the directory client, not the in-path gate.
- Framework bindings: @mcp-index/mastra wires check_tool_trust into Mastra as a beforeToolCall hook (warn or enforce; fail-closed, no credentials). A client of the advisory screen, not the in-path gate.
- Pipeline (screen): today the screen is semantic-only - an LLM judge reads each tool description for hidden instructions. The deterministic conformance probe (drives the tool against its declared schema) is built but has NOT yet run on the public corpus, so no published screen verdict carries a conformance result; a clearing ALLOW (which the probe would earn) is not produced at v1. When the probe runs it is monitored, not enforced. Confidence is reported but not yet calibrated (calibrated=false).
- History: OTS Bitcoin-anchored. Cadence bound = confirmation latency (~10 minutes for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized). Sub-window precision asserted, not proven. In-process verify proves the proof carries a Bitcoin BlockHeaderAttestation; confirmation-depth check is the relying party's job against their own Bitcoin node.
- Calibration: calibrated=false at v1. Confidences are reported, not yet calibrated against a held-out adversarial corpus.
- Exposure: anonymous calls return the current verdict (directive, status, dimension verdicts, severity, expires_at). Free, no key required - nothing on this API is paid-tier.
- Graduation gate (D3): >=${D3_REQUIRED_LABELS} conforming labels with FP upper-95 <=2%. Current: ${D3_PROGRESS}. Terminal-v1 trigger 2026-09-01: under 50 conforming = ships calibrated=false as terminal (v2 graduation, not v1).
- Deployment posture: advisory. mcpindex publishes the verdict; the agent or IDE decides whether to act on it.
- Full method: [mcpindex.ai/methodology](https://mcpindex.ai/methodology)

## Drift Network (crawler-corroborated; warns you on call 1)

- What it is: mcpindex crawls the public MCP registry every day and records which tool contracts silently change. When you pin a tool, the gate can ask the network whether the crawler already caught that contract drifting - and warn you on the FIRST call, before a change you never saw burns you. A contract-diff advisory; it rides alongside the verdict and never moves PROCEED/HOLD.
- Opt-in: enable with MCPINDEX_DRIFT_TELEMETRY=detection (off by default). Under the same flag the gate emits one one-way salted-fingerprint signal on a pin/drift and queries the network; it never sends schemas, arguments, descriptions, URLs, or server/tool names.
- Corroboration is crawler-first: the public count floors at the crawler (sources=1), never forgeable install reports.
- Public proof: every drift the crawler catches is in the public drift ledger (/ledger).

## Whitepaper

- Full architecture of the in-path trust gate (and the trust-to-act category it belongs to): threat model, tiered ladder, methodology, dogfood proof, and the honest limits (contract-diff not safety oracle; calibrated=false; tiers 1-3 held off by default).
- Public, free to read in full, with a free PDF (no email required): [mcpindex.ai/whitepaper](https://mcpindex.ai/whitepaper)
- PDF: [mcpindex.ai/whitepaper.pdf](https://mcpindex.ai/whitepaper.pdf)

## Endpoints an agent can call

- POST /api/mcp                                                  Remote MCP server (Streamable HTTP) - connect any MCP client without installing; exposes the 6 tools below as MCP.
- GET /api/v1/search?q=<query>                                   Keyword + semantic search across servers.
- GET /api/v1/recommend?task=<text>                              Natural language task -> top 3 servers with reasoning.
- GET /api/v1/preflight?task=<text>                              Pre-flight: top servers + the rank-1 server's advisory verdict in one call.
- GET /api/v1/diff?since=<YYYY-MM-DD>                            What changed in the registry since a date.
- GET /api/v1/drift/any?fp=<tool_fingerprint>                    Fleet drift query: has this tool's contract drifted (crawler-corroborated)? Powers "warns you on call 1". Returns {drifted, sources, safety_relevant}.
- GET /api/v1/ledger                                             Public drift ledger: contract changes the crawler observed (fingerprint-only; a contract-diff, not a safety verdict).
- GET /api/v1/trust/tool/<server_id>/<tool_name>                 Per-tool advisory screen verdict (v1: REVIEW when screened, else UNVERIFIED fail-closed; ALLOW/DENY reserved, not produced).
- GET /api/v1/trust/server/<server_id>                           Server-level advisory screen verdict (same honesty as per-tool).
- GET /api/registry-count                                        Live server + category count.
- GET /llms-full.txt                                             Full per-server index in one document.
- GET /.well-known/mcp-index.json                                Machine-readable site + gate + advisory-screen capability descriptor.

## MCP server (drop-in directory client)

\`\`\`bash
npm install -g mcp-server-mcpindex
\`\`\`

Or connect remotely (no install): point any MCP client that supports remote servers at [mcpindex.ai/api/mcp](https://mcpindex.ai/api/mcp) (Streamable HTTP, no credentials) - same six tools.

Add to Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed. Prefer CLI one-liners when available:

\`\`\`bash
claude mcp add --scope user mcpindex -- npx -y mcp-server-mcpindex@latest
gemini mcp add -s user mcpindex npx -y mcp-server-mcpindex@latest
\`\`\`

This is the advisory directory client - not the in-path gate (\`mcpindex-gate\` / install.sh). Three primary calls:

- recommend_mcp_for_task("read pdfs and write to s3")        -> discovery
- check_tool_trust(server_id="<id>", tool_name="<name>")     -> per-tool advisory screen verdict
- assess_server(server_id="<id>")                            -> server-level advisory screen verdict

## Project pages

- [Docs](https://mcpindex.ai/docs): How it works, how to wire it into Claude/Cursor/Gemini/Cline/Zed, response anatomy.
- [Scan](https://mcpindex.ai/scan): Paste your mcp.json; see each tool's blast radius (action, reversibility, off-machine egress) in the browser. Nothing uploaded.
- [Screen](https://mcpindex.ai/screen): Paste a tool description; the live LLM judge returns an advisory REVIEW/UNVERIFIED verdict.
- [Servers](https://mcpindex.ai/servers): A-Z browse hub over all ${servers} per-server detail pages (JSON-LD typed, verdict surfaced when available); individual pages live at /server/<slug>.
- [Guides](https://mcpindex.ai/guides): Practical guides: trust/security reviews, comparisons, integration how-tos; individual guides at /guides/<slug>.
- [Best by category](https://mcpindex.ai/best): Curated picks per category, at /best/<category>.
- [Leaderboard](https://mcpindex.ai/leaderboard): Top 50 by MCP Quality Score.
- [Drift ledger](https://mcpindex.ai/ledger): Public drift ledger: contract changes the crawler observed across public MCP servers.
- [Dashboard](https://mcpindex.ai/dashboard): Drift network coverage + opt-in telemetry adoption (honest: opt-in counts are not all users).
- [Changelog](https://mcpindex.ai/changelog): Daily diff of registry changes.
- [Changelog RSS](https://mcpindex.ai/changelog.rss): RSS 2.0 feed of the above.
- [Trust model](https://mcpindex.ai/trust): Trust model + honest limits: contract-diff, not a safety verdict; where the gate runs, what leaves the machine.
- [Methodology](https://mcpindex.ai/methodology): The eval (semantic-only today; conformance probe built but not yet run), four-state verdict, honest limits.
- [Stats](https://mcpindex.ai/stats): How many MCP servers are there? Live official-registry count with stated methodology (what counts as a server).
- [Whitepaper](https://mcpindex.ai/whitepaper): Architecture whitepaper: gate, threat model, methodology, honest limits. Public; free PDF, no email wall.
- [About](https://mcpindex.ai/about): Why this exists.

Unofficial. Not affiliated with Anthropic.
`;
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Uncached during the AEO measurement window; revert to s-maxage=3600 afterward.
      'Cache-Control': 'no-store',
    },
  });
}
