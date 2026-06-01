<p align="center">
  <a href="https://mcpindex.ai"><img src="public/brand/github-readme.png" alt="mcpindex.ai - the trust layer for MCP tools" width="840"></a>
</p>

# mcpindex.ai

> The trust layer for MCP tools.

A verdict (ALLOW / DENY / REVIEW) on whether an MCP tool does what it claims, before your agent acts. Your agent trusts every tool it is handed; mcpindex doesn't.

[Live site](https://mcpindex.ai) · [Trust](https://mcpindex.ai/trust) · [Methodology](https://mcpindex.ai/methodology) · [Brand](https://mcpindex.ai/brand) · [npm: mcp-server-mcpindex](https://www.npmjs.com/package/mcp-server-mcpindex)

## Three primitives

1. **Trust verdict API** - `GET /api/v1/trust/tool/<server_id>/<tool_name>` returns a per-tool verdict: decision + dimensions + severity. Fail-closed; advisory at v1.
2. **Drop-in MCP server** - `npm install -g mcp-server-mcpindex`. Add to Claude Desktop / Cursor / Cline / Zed; ask `check_tool_trust` before invoking a tool it just discovered.
3. **Agent-readable surfaces** - indexed directory plus `/llms.txt`, `/.well-known/mcp-index.json`, and JSON-LD on every page.

## Develop

```bash
npm install
node scripts/fetch-snapshot.mjs    # one-time: pull current registry snapshot
npm run dev                         # http://localhost:3000
```

Snapshot lives at `data/snapshot.json` (committed). Refresh anytime with the script.

## Stack

- Next.js 16 (App Router) on Vercel
- Tailwind v4
- Local snapshot of `registry.modelcontextprotocol.io/v0/servers`, refreshed daily via Vercel cron
- Quality Score: `lib/quality.ts` (open methodology - PRs welcome)
- Search: `lib/search.ts` (keyword now; embeddings v2 when OPENAI_API_KEY is wired)

## Project layout

```
mcpindex/
├── app/                    # Next.js routes
│   ├── api/v1/             # Versioned public API
│   ├── api/cron/           # Vercel-cron-driven endpoints
│   ├── server/[slug]/      # 3,500+ per-server pages (generateStaticParams)
│   ├── best/[category]/    # 28 curated category pages
│   └── ...                 # leaderboard, changelog, methodology, about, pricing, terms, privacy, stats
├── components/             # Header, Footer, AgentDemo (live demo), LiveTicker
├── lib/                    # registry, quality, search, categorize, installs, types
├── scripts/                # sync-registry.mjs, fetch-snapshot.mjs (one-shot)
├── data/                   # snapshot.json (committed) + snapshots/ (cron-written)
├── launch/                 # all launch-day copy: Show HN, Reddit, cold emails, pitches
├── mcp-server-mcpindex/    # the npm-distributed MCP server
└── READY_TO_LAUNCH.md      # ops checklist for going live
```

## License

- Web app code: source-available, all-rights-reserved (prevents direct fork-and-deploy by competitors).
- `mcp-server-mcpindex` (the npm package): MIT.
- MCP Quality Score methodology: open and PR-friendly.

## Affiliation

Unofficial. Not affiliated with Anthropic. The Model Context Protocol is open under MIT and trademarks remain with their owners. Server data comes from the official MCP registry.
