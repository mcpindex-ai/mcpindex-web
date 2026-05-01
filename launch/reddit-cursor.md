# r/cursor

**Title:** Drop-in MCP server for finding other MCP servers from inside Cursor

**Body:**

If you've added more than a handful of MCP servers to Cursor and lost track of which one does what, I built something for that.

`mcp-server-mcpindex` is an MCP server that recommends other MCP servers. Install it once, then ask Cursor to find the right MCP for a task.

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "mcpindex": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcpindex"]
    }
  }
}
```

Then in chat: "find an MCP for postgres with read-only mode" or "what should I use to scrape a webpage and save to S3" — Cursor calls `recommend_mcp_for_task`, returns top 3 with install JSON ready to paste back into mcp.json.

Backed by mcpindex.ai which indexes the full official MCP registry (3,500+ servers) and ranks them by a public Quality Score methodology.

Free, no API key. Source on GitHub. MIT.

Live demo on the homepage if you want to try without installing: https://mcpindex.ai
