# r/ClaudeAI

**Title:** I built an MCP server for finding MCP servers

**Body:**

3,500+ MCP servers in the official registry now. Nobody loves browsing them in a sidebar. I shipped mcpindex.ai — a discovery layer with an actual MCP server you install in Claude Desktop:

```
npm install -g mcp-server-mcpindex
```

Then in Claude config:

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

Now ask Claude: "find me an MCP server that can read PDFs and save to S3." It calls `recommend_mcp_for_task`, returns top 3 with reasoning + install commands.

Live demo on the homepage if you don't want to install: https://mcpindex.ai

Free, no API key, rate-limited at 60/min. Source code public. MIT for the npm package. Unofficial — not affiliated with Anthropic.

Tools exposed:
- `recommend_mcp_for_task(task)` — natural-language → top 3 picks
- `search_mcp_servers(query, category?)` — keyword + semantic
- `get_install_command(slug, client)` — exact JSON for your client
- `compare_servers([slugs])` — side-by-side

Curious what would make this useful enough to leave installed.
