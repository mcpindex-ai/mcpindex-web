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

- Verdict contract: 1.0.0 (allow / deny / review, with severity info..critical).
- Capability: check_tool_trust (exposed by the npm MCP server, see below).
- Pipeline: hybrid eval - a deterministic conformance probe plus an LLM judge for hidden intent. Both legs execute and are recorded; conformance is monitored, not enforced, at v1.
- History: OTS Bitcoin-anchored. Cadence bound = confirmation latency (~10 minutes to ~1 hour for 1 to 6 confirmations). Sub-window timing is asserted, not proven.
- Calibration: calibrated=false at v1. Confidences are reported, not yet calibrated against a held-out adversarial corpus.
- Exposure: anonymous calls return the current verdict (directive, status, dimension verdicts, severity, expires_at). History is paid-tier only.
- Graduation gate (D3): >=150 conforming labels with FP upper-95 <=2%. Current: 15/150.
- Deployment posture: advisory. mcpindex publishes the verdict; the agent or IDE decides whether to act on it.
- Full method: https://mcpindex.ai/methodology

## Endpoints an agent can call

- GET /api/v1/search?q=<query>           Keyword + semantic search across servers.
- GET /api/v1/recommend?task=<text>      Natural language task -> top 3 servers with reasoning.
- GET /api/v1/diff?since=<YYYY-MM-DD>    What changed in the registry since a date.
- GET /api/registry-count                Live server + category count.
- GET /llms-full.txt                     Full per-server index in one document.
- GET /.well-known/mcp-index.json        Machine-readable site + trust-layer capability descriptor.

## MCP server (drop-in)

\`\`\`bash
npm install -g mcp-server-mcpindex
\`\`\`

Add to Claude Desktop / Cursor / Cline / Zed. Two primary calls:

- recommend_mcp_for_task("read pdfs and write to s3")  -> discovery
- check_tool_trust(server="<slug>", tool="<tool_name>") -> trust verdict (advisory)

## Project pages

- /docs                     How it works, how to wire it into Claude/Cursor/Cline/Zed, response anatomy.
- /server/<slug>            Per-server detail (3,000+ pages, JSON-LD typed, verdict surfaced when available).
- /best/<category>          Curated picks per category.
- /leaderboard              Top 50 by MCP Quality Score.
- /changelog                Weekly diff of registry changes.
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
