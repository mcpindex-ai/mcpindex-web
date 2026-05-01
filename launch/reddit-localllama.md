# r/LocalLLaMA

**Title:** mcpindex.ai — recommendation API + npm-distributed MCP server for finding MCP servers

**Body:**

For folks running local agents who don't want to maintain a curated mental list of which MCP server does what, I shipped mcpindex.ai today.

Two surfaces:

1. Public API at `/api/v1/recommend?task=<natural language>` — free, 60 req/min/IP, returns top 3 ranked picks with install commands. Useful if you're building a router or a tool-selection layer in front of your local agent.

2. An MCP server (`npm install -g mcp-server-mcpindex`) you can wire into any MCP client. Works with Cline, Claude Desktop, Cursor, Zed.

Quality scoring is from public registry data only — freshness, completeness, installability, env-var docs, semver stability. No GitHub stars, no popularity contest. Methodology is open: https://mcpindex.ai/methodology

Source code public. MIT for the npm package. Snapshot updates daily.

If you've been keeping a hand-curated list of MCP servers in a notes file, I'd love to know what gaps the auto-ranking misses for your use case.
