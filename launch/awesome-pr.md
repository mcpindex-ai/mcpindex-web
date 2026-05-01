# PR to awesome-mcp-servers

**Repo:** https://github.com/punkpeye/awesome-mcp-servers

**Branch name:** `add-mcpindex`

**PR title:** Add mcpindex.ai (discovery layer + npm-distributed MCP server)

**PR body:**

Adding mcpindex.ai under a new Frameworks/Discovery section (or under Tools, whichever fits the maintainer's structure).

It's an agent-native discovery layer — recommendation API on top of the official registry plus a drop-in MCP server (`npm install -g mcp-server-mcpindex`) so any client can find other MCP servers from inside the agent loop.

Different shape from the existing directories:
- Machine-first (versioned API, /llms.txt, JSON-LD per page)
- Recommendation engine (`/api/v1/recommend?task=<NL>`) rather than search-only
- Open MCP Quality Score methodology

Free tier 60 req/min/IP, no key. Source on GitHub (MIT for the npm package).

Happy to adjust the entry's wording or section placement to fit the repo conventions.

**Suggested entry text (markdown):**

```md
- [mcpindex.ai](https://mcpindex.ai) - Agent-native discovery layer over the official MCP registry. Recommendation API + drop-in MCP server (`mcp-server-mcpindex` on npm) for Claude Desktop, Cursor, Cline, Zed. Open Quality Score methodology.
```

**PR to also open at:**
- `modelcontextprotocol/servers` (community-list section if it exists)
- Any other "list of MCP things" curated repos with > 100 stars
