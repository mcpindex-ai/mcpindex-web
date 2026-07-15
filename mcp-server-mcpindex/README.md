# mcp-server-mcpindex

> An MCP server for finding MCP servers, plus advisory trust verdicts agent frameworks can call before invoking a tool.

A drop-in MCP server that lets your agent discover, compare, install, and pre-flight other MCP servers from inside the agent loop. Backed by [mcpindex.ai](https://mcpindex.ai) - the agent-native index of 3,500+ MCP servers indexed daily from the official registry.

## Install

```bash
npm install -g mcp-server-mcpindex
```

This is the **directory / advisory** client (recommend, search, trust). It does **not** install the in-path drift gate — that is `curl -fsSL https://mcpindex.ai/install.sh | sh`.

### Or connect remotely (no install)

Prefer not to install anything? mcpindex is also a **hosted remote MCP server**. Point any client that supports remote MCP (Claude connectors, Cursor, etc.) at:

```
https://mcpindex.ai/api/mcp
```

Streamable HTTP, no credentials. Same six tools as the npm package.

### Claude Code

```bash
claude mcp add --scope user mcpindex -- npx -y mcp-server-mcpindex@latest
```

### Gemini CLI

```bash
gemini mcp add -s user mcpindex npx -y mcp-server-mcpindex@latest
```

## Use it from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcpindex": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcpindex@latest"]
    }
  }
}
```

> `@latest` keeps you current: this is the advisory discovery server (not the in-path drift
> gate), so it carries no version pin — `npx` fetches the newest on your next host restart, no
> manual upgrade step.

Restart Claude Desktop. Then ask:

> "Find me an MCP server that can read PDFs and write the contents to S3."

Claude calls `recommend_mcp_for_task` and returns the top 3 ranked servers with install commands.

## Use it from Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mcpindex": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcpindex@latest"]
    }
  }
}
```

## Use it from Cline

Add to your Cline settings:

```bash
npx -y mcp-server-mcpindex@latest
```

## Tools exposed

| Tool | What it does |
| --- | --- |
| `recommend_mcp_for_task` | Pass a natural-language task. Returns top 3 servers with reasoning, install commands, quality scores. |
| `search_mcp_servers` | Keyword + semantic search across the full registry. Optional category filter. |
| `get_install_command` | Get the exact install JSON/CLI for a server + client (Claude Desktop, Claude Code, Cursor, Gemini CLI, Cline, Zed). |
| `compare_servers` | Side-by-side comparison of 2-5 servers - quality scores, install paths, env vars. |
| `check_tool_trust` | Pre-invocation advisory verdict for a specific tool on a server. Fail-CLOSED: returns UNVERIFIED when no verdict on file. |
| `assess_server` | Aggregated pre-flight verdict across all tools on a server. Same shape as `check_tool_trust`. |

## Agent-framework integration: advisory pre-invocation screen

`check_tool_trust` is the **directory client** integration surface (not the in-path `mcpindex-gate`). It lets agent frameworks (Composio, Mastra, LangChain, DSPy, raw LLM-tool-call loops) ask for an advisory screen verdict before dispatching a call. At v1 you will see REVIEW or UNVERIFIED — not a safety clearance.

### Verdict contract (v1)

```jsonc
{
  "directive": "ALLOW" | "DENY" | "REVIEW" | "UNVERIFIED",
  "status":    "EVALUATED" | "STALE" | "ERROR",
  "dimensions": [
    { "id": "tool_safety", "verdict": "PASS", "severity": "INFO" }
  ],
  "expires_at": "2026-06-30T00:00:00Z",
  "honest_limits": [
    "conformance_monitored_not_enforced",
    "calibrated_false_v1",
    "advisory_deployment"
  ],
  "verdict_contract_version": "1.0.0",
  "server_id": "github",
  "tool_name": "create_pull_request",
  "source_url": "https://mcpindex.ai/api/v1/trust/tool/github/create_pull_request",
  "fetched_at": "2026-05-28T18:42:11.118Z"
}
```

The free-tier verdict ships directives + dimensions + freshness. Evidence quotes, LLM rationale, and chain history are paid-tier surfaces and intentionally omitted here.

### Honest limits (pin these to your gate UI)

Every v1 verdict ships with these three caveats, and your gate SHOULD surface them on every dispatch decision:

1. `conformance_monitored_not_enforced` - publishers self-declare; mcpindex monitors drift but does not block at the network layer.
2. `calibrated_false_v1` - dimension severities are not yet calibrated against real-world incident data.
3. `advisory_deployment` - the verdict is advisory; the agent (or human reviewing the agent) is the decision-maker.

History anchoring: OTS Bitcoin-anchored history; Bitcoin-finalized at N=6 confirmations (~1 hr); pending in ~10 min. Sub-window precision asserted, not proven.

### Integration pattern (LangChain-style, direct LLM-tool-call convention)

```js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const mcpindex = new Client({ name: 'gate', version: '1.0.0' }, { capabilities: {} });
await mcpindex.connect(new StdioClientTransport({
  command: 'npx', args: ['-y', 'mcp-server-mcpindex@latest'],
}));

// gateToolCall wraps any agent tool dispatch. Plug it in front of
// the LangChain / DSPy / Mastra / Composio tool-call hook.
async function gateToolCall({ serverId, toolName, invoke, askHuman }) {
  const res = await mcpindex.callTool({
    name: 'check_tool_trust',
    arguments: { server_id: serverId, tool_name: toolName },
  });
  const verdict = JSON.parse(res.content[0].text);

  // Pin the v1 caveats in the audit log no matter what.
  audit.log({ verdict, caveats: verdict.honest_limits });

  switch (verdict.directive) {
    case 'REVIEW':
      // Fail-CLOSED to human. Do NOT auto-execute on REVIEW.
      // At v1 this is the common screened outcome (semantic-only).
      return askHuman({ verdict, action: `${serverId}/${toolName}` });

    case 'UNVERIFIED':
      // No verdict on file (or upstream unreachable). Fail-CLOSED.
      // Recommend human review. Do NOT fail-open to invoke().
      return askHuman({
        verdict,
        action: `${serverId}/${toolName}`,
        note: 'No trust verdict on file. Human review required before first use.',
      });

    case 'ALLOW':
      // Reserved in the contract — not produced by the v1 public screen.
      // Keep the branch for future conformance-earned ALLOW; do not expect it today.
      return invoke();

    case 'DENY':
      // Reserved in the contract — not produced by the v1 public screen.
      throw new Error(
        `mcpindex denied ${serverId}/${toolName}: ${JSON.stringify(verdict.dimensions)}`,
      );

    default:
      // Unknown directive. Fail-CLOSED.
      return askHuman({ verdict, action: `${serverId}/${toolName}` });
  }
}
```

### The load-bearing rule: never fail-open

If the verdict endpoint is unreachable, returns 404, times out, or returns malformed JSON, `check_tool_trust` returns `directive: "UNVERIFIED"` + `status: "ERROR"`. It never silently coerces to ALLOW. Your gate code SHOULD treat UNVERIFIED as "human review required", never as "looks fine, ship it."

This is tested. See `test/trust.test.mjs`.

### Using the library directly (without MCP)

The trust client is also exported as a plain ES module:

```js
import { checkToolTrust, assessServer } from 'mcp-server-mcpindex/src/trust.mjs';

const verdict = await checkToolTrust({
  serverId: 'github',
  toolName: 'create_pull_request',
});

if (verdict.directive !== 'ALLOW') {
  // Hand to a human, log, or block.
}
```

## Backend

By default, calls go to `https://mcpindex.ai`. Override with `MCPINDEX_API_BASE=...` if you self-host.

The free tier is rate-limited to 60 req/min/IP. Paid keys are coming for higher throughput and the full evidence-bearing verdict (evidence quotes, LLM rationale, chain history).

## License

MIT.

## Project

- Website: [mcpindex.ai](https://mcpindex.ai)
- Methodology: [mcpindex.ai/methodology](https://mcpindex.ai/methodology)
- Screen a server: [mcpindex.ai/screen](https://mcpindex.ai/screen)
- Guide: [Find the right MCP server by task](https://mcpindex.ai/guides/find-mcp-server-by-task)
- Source: [github.com/mcpindex-ai](https://github.com/mcpindex-ai)

[![mcp-server-mcpindex MCP server](https://glama.ai/mcp/servers/mcpindex-ai/mcp-server-mcpindex/badges/score.svg)](https://glama.ai/mcp/servers/mcpindex-ai/mcp-server-mcpindex)

Unofficial. Not affiliated with Anthropic.
