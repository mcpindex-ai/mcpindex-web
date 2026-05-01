# Indie Hackers post

**Title:** Shipped a discovery layer for MCP servers. Here's the thinking.

**Body:**

The MCP ecosystem hit ~3,500 public servers indexed in Anthropic's registry. Four directories already compete on the human-browsable layer (PulseMCP, Smithery, Glama, MCP.so). I didn't want to be the fifth.

Instead I shipped mcpindex.ai as the **agent-native** layer — built for the IDE/agent that needs to find an MCP server at inference time, not the developer scrolling a sidebar.

What's actually different:

1. There's an API (`/api/v1/recommend`) that takes a natural-language task and returns ranked picks. Free tier, 60 req/min/IP. The response shape is designed to feed straight into an LLM's tool-call output.

2. There's a drop-in MCP server (`npm install -g mcp-server-mcpindex`) so Claude Desktop / Cursor / Cline / Zed users can install one MCP server that finds them all the others. Recursive, kind of.

3. MCP Quality Score — five public-data signals (freshness, completeness, installability, doc coverage, semver stability), composited 0-100, scored daily across the whole registry. Methodology is open + open-source.

Build details:
- Next.js 16 on Vercel.
- Local snapshot of the registry, refreshed daily via cron.
- Source: github.com/mcpindex.
- ~7 days of work solo.

The full strategy memo (it's a domain-flip play, not a long-term build) is at /about. Honest about that part.

Open to feedback on what would make this stick versus drift.
