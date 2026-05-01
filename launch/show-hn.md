# Show HN post

**Title (80 chars max):**
> Show HN: An MCP server for finding MCP servers

**URL:** https://mcpindex.ai

**Text body (HN auto-prepends "Hi HN —"):**

I built mcpindex.ai because the MCP ecosystem now has 3,500+ servers and no good answer to "which one should I install for X." The official registry is the canonical data source but its API is built for browsing, not for an agent calling at inference time.

Two things on the site:

1. A live demo on the homepage. Type a task ("read PDFs and write to S3"), get top 3 ranked picks with reasoning and install commands. The API is `/api/v1/recommend?task=...`, free, no key.

2. A drop-in MCP server (`npm install -g mcp-server-mcpindex`) so the recommendation lives inside Claude Desktop / Cursor / Cline / Zed. Install it once, then ask your agent to find other MCP servers without leaving the loop.

Other surfaces:
- `/llms.txt` and `/.well-known/mcp-index.json` so agent crawlers can discover endpoints
- 3,500 per-server pages with JSON-LD for SEO + agent search
- An open MCP Quality Score methodology — five public-data signals, source on GitHub
- `/changelog` + RSS for what's new in the registry day-over-day

Built solo over a weekend. Source code is open (web is source-available, the MCP server is MIT). Curious what's missing — what would make this useful enough to leave installed?

Unofficial. Not affiliated with Anthropic.

---

**Comment-shift script (first 4 hours):**

- "What's the bar for inclusion?" → "Everything in the official registry that's marked active and latest-version. We don't curate inclusion — we surface ranking. Quality Score methodology at /methodology is the only filter."
- "How do you handle servers that go bad?" → "Registry is the source of truth — if Anthropic deprecates, we drop it on next sync. We don't audit security; we link the repo."
- "Where do quality signals come from?" → "Public registry fields only — freshness, completeness of metadata, installability (runnable package or URL present), env-var documentation, semver. No GitHub stars, no downloads — those aren't gameable in a meaningful way for MCP yet."
- "Why not just submit a PR to the official registry UI?" → "The registry is data; this is the recommendation layer + agent surface on top. They're complementary."
- "How is this different from Smithery/PulseMCP?" → "They're human-browsable directories. This is machine-first — the API and the npm package are the product. The website is the docs."
- If hostile: "Fair point — what would change your mind?"
