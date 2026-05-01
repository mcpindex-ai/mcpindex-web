# Cold email — Template C: Anthropic DevRel post-launch

**For:** Mahesh Murag and the MCP team lead at Anthropic.

**When:** Day 21+. Only after Show HN + npm package + the docs at /llms.txt are live. This is **not** asking for permission; it's sharing.

**Subject:** Built something on the registry — wanted to share

**Body:**

Hi [name] —

Saw the registry API freeze at v0.1 and built mcpindex.ai as an agent-native discovery layer on top. The thesis: registry is the canonical data source, but an agent at inference time needs a recommendation surface — not a list endpoint.

Three primitives, all live:

1. `/api/v1/recommend?task=<natural language>` — free, no key, 60 req/min/IP. Returns ranked picks with install commands.
2. `npm install -g mcp-server-mcpindex` — drop-in MCP server. Add to Claude Desktop and try `recommend_mcp_for_task("read pdf and save to s3")` to see the shape.
3. `/llms.txt` + `/.well-known/mcp-index.json` — first concrete attempt I've seen at "agent-readable site description" for the MCP ecosystem.

Two things that might be interesting:

- The site is a strict superset of the registry — every entry sources from `registry.modelcontextprotocol.io/v0/servers` and is enriched with the open MCP Quality Score (methodology at /methodology, source on GitHub). If/when registry adds verified-by-vendor or other upstream signals, the score absorbs them.
- The MCP server itself could be the API Claude Desktop calls when you ship in-product `/add mcp` discovery — happy to discuss API stability, rate-limits, or any structural concerns.

Not asking for anything. Happy to coordinate, hand off, take feedback, or just have it sit there as a community contribution. Disclaimer is in the footer of every page.

Thank you,
GB

---

**Variant for X mention (if no email):**

Built mcpindex.ai on top of the v0 registry — agent-native discovery layer + drop-in MCP server. Live: https://mcpindex.ai. /llms.txt convention is documented there. Open to feedback from the team.
