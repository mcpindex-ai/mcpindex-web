# Directory submissions checklist

All forms accept submissions without account creation. Should take under 30 minutes total.

## PulseMCP
- URL: https://www.pulsemcp.com/submit
- Server name: `mcp-server-mcpindex`
- Description: An MCP server for finding MCP servers. Recommendation API on top of the official registry. Daily-refreshed quality score across 3,500+ servers.
- Repo: https://github.com/mcpindex/mcp-server-mcpindex
- Install: `npm install -g mcp-server-mcpindex`

## Smithery
- URL: https://smithery.ai/submit (or via their CLI)
- Same metadata as above.

## Glama
- URL: https://glama.ai/mcp/servers/submit
- Same metadata.

## MCP.so
- URL: https://mcp.so/submit
- Same metadata.

## Official registry (modelcontextprotocol/registry)
- URL: https://registry.modelcontextprotocol.io
- Submit via `mcp publish` CLI per https://registry.modelcontextprotocol.io/docs
- Fields:
  - name: `app.mcpindex/mcp-server-mcpindex`
  - description: An MCP server for finding MCP servers. Recommendation API + quality scoring on top of the official registry.
  - repository: github.com/mcpindex/mcp-server-mcpindex
  - packages: npm `mcp-server-mcpindex`

## Apify Store (optional)
- If MCP-tagged store exists: https://apify.com/store
- Same metadata.

## Notes
- Use the same name (`mcp-server-mcpindex`) and one-line description across all submissions for brand consistency.
- Each submission is one shot — no follow-ups expected.
