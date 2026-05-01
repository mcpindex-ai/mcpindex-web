# LinkedIn launch post

3,500+ MCP servers exist. None of them are easy to find from inside an agent.

I shipped mcpindex.ai today — a discovery layer on top of the official MCP registry, built so an agent can call it at inference time instead of asking the developer to browse a sidebar.

Three primitives:

→ /api/v1/recommend takes a natural-language task ("read PDFs and write to S3") and returns ranked picks with install commands.

→ A drop-in MCP server (npm install -g mcp-server-mcpindex) so Claude Desktop / Cursor / Cline / Zed can find other MCP servers from inside the agent loop.

→ MCP Quality Score — a five-dimension composite from public registry data, scored daily across all 3,500 servers. Methodology is open and PR-friendly.

What I learned building it:

The MCP ecosystem is in a strange spot. Anthropic shipped the canonical registry. Four directories (PulseMCP, Smithery, Glama, MCP.so) compete on volume and human UX. But every IDE that ships MCP discovery is going to need an API surface, not a sidebar — and nobody had built that yet.

Live demo: https://mcpindex.ai

Source: https://github.com/mcpindex-ai (MIT for the npm package)

Built solo. Open to comments and PRs.
