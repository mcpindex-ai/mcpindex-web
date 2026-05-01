# mcp-server-mcpindex

> An MCP server for finding MCP servers.

A drop-in MCP server that lets your agent discover, compare, and install other MCP servers from inside the agent loop. Backed by [mcpindex.ai](https://mcpindex.ai) — the agent-native index of 3,500+ MCP servers indexed daily from the official registry.

## Install

```bash
npm install -g mcp-server-mcpindex
```

## Use it from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcpindex": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcpindex"]
    }
  }
}
```

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
      "args": ["-y", "mcp-server-mcpindex"]
    }
  }
}
```

## Use it from Cline

Add to your Cline settings:

```bash
npx -y mcp-server-mcpindex
```

## Tools exposed

| Tool | What it does |
| --- | --- |
| `recommend_mcp_for_task` | Pass a natural-language task. Returns top 3 servers with reasoning, install commands, quality scores. |
| `search_mcp_servers` | Keyword + semantic search across the full registry. Optional category filter. |
| `get_install_command` | Get the exact install JSON for a server + a target client (Claude Desktop, Cursor, Cline, Zed). |
| `compare_servers` | Side-by-side comparison of 2-5 servers — quality scores, install paths, env vars. |

## Backend

By default, calls go to `https://mcpindex.ai`. Override with `MCPINDEX_API_BASE=...` if you self-host.

The free tier is rate-limited to 60 req/min/IP. Paid keys are coming for higher throughput.

## License

MIT.

## Project

- Website: [mcpindex.ai](https://mcpindex.ai)
- Methodology: [mcpindex.ai/methodology](https://mcpindex.ai/methodology)
- Source: [github.com/mcpindex-ai](https://github.com/mcpindex-ai)

Unofficial. Not affiliated with Anthropic.
