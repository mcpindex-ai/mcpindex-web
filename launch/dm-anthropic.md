# Anthropic DevRel — single-shot DM (post-launch, no ask)

**Targets (in priority order):**
- Mahesh Murag (MCP team lead)
- Whoever currently runs Anthropic DevRel for MCP
- @anthropic on X (mention rather than DM if no contact)

**Subject (if email):** Built something on the registry — wanted to share

**Body:**

Hi [name] —

Saw the registry API freeze at v0.1; built mcpindex.ai as an agent-native discovery layer on top. The thesis: the registry is the canonical data source, but an agent at inference time needs a recommendation surface, not a list endpoint.

Live demo: https://mcpindex.ai

The MCP server is `npm install -g mcp-server-mcpindex` — your team is welcome to install it in Claude Desktop and try `recommend_mcp_for_task("read pdf and save to s3")`.

Three things that might be interesting on the Anthropic side:

1. /llms.txt + /.well-known/mcp-index.json — first attempt I've seen at "agent-readable site description" for the MCP ecosystem specifically. Curious if there's a convention you're standardizing.

2. MCP Quality Score — open methodology, computed from public registry fields only. If you ever want to absorb a "verified by vendor" or "officially blessed" field upstream, the score will pick it up.

3. The recommendation API itself — free, 60 req/min/IP — could be the API that Claude Desktop calls if you ever ship `/add mcp` server discovery in-product.

Not asking for anything. Happy to coordinate or hand off if useful, very open to feedback.

Thank you,
GB
