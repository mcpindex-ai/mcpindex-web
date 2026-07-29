<p align="center">
  <a href="https://mcpindex.ai"><img src="public/brand/github-readme.png" alt="mcpindex.ai — the in-path trust gate for agent tool calls" width="840"></a>
</p>

# mcpindex.ai

> The in-path trust gate for agent tool calls.

[![npm](https://img.shields.io/npm/v/mcp-server-mcpindex?logo=npm&label=npm)](https://www.npmjs.com/package/mcp-server-mcpindex)
[![npm downloads](https://img.shields.io/npm/dw/mcp-server-mcpindex)](https://www.npmjs.com/package/mcp-server-mcpindex)
[![PyPI](https://img.shields.io/pypi/v/mcpindex-gate?label=mcpindex-gate)](https://pypi.org/project/mcpindex-gate/)
[![servers indexed](https://mcpindex.ai/api/v1/badge/meta/servers?v=1)](https://mcpindex.ai/stats)
[![screened](https://mcpindex.ai/api/v1/badge/meta/screened?v=1)](https://mcpindex.ai/stats)
[![last commit](https://img.shields.io/github/last-commit/mcpindex-ai/mcpindex-web)](https://github.com/mcpindex-ai/mcpindex-web/commits/main)
[![Smithery](https://smithery.ai/badge/gautamgb/mcpindex)](https://smithery.ai/servers/gautamgb/mcpindex)
[![Glama](https://glama.ai/mcp/servers/mcpindex-ai/mcp-server-mcpindex/badges/score.svg)](https://glama.ai/mcp/servers/mcpindex-ai/mcp-server-mcpindex)

MCP tool contracts can change remotely with no version bump. mcpindex **pins each contract** and **HOLDs the call** when it drifts — before your agent acts. Deterministic contract-diff on your host. Zero credential custody. Not a safety oracle.

[Live site](https://mcpindex.ai) · [Install gate](https://mcpindex.ai/#install) · [`npx mcp-server-mcpindex`](https://www.npmjs.com/package/mcp-server-mcpindex) · [`pip install mcpindex-gate`](https://pypi.org/project/mcpindex-gate/) · [Remote MCP](https://mcpindex.ai/api/mcp) · [Docs](https://mcpindex.ai/docs) · [Trust](https://mcpindex.ai/trust) · [Methodology](https://mcpindex.ai/methodology)

## What you get

1. **In-path drift gate** — one command wires Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed so each MCP server launches behind the gate. Local, fail-closed, default build egresses nothing.  
   `curl -fsSL https://mcpindex.ai/install.sh | sh` (inspect first with `| less`) · PyPI: [`mcpindex-gate`](https://pypi.org/project/mcpindex-gate/)
2. **Advisory directory** — search, recommend, preflight (`/api/v1/preflight`), and trust lookups over HTTP or as a drop-in MCP server (`mcp-server-mcpindex`). Screen verdicts are REVIEW / UNVERIFIED at v1; ALLOW / DENY are reserved in the contract.
3. **Agent-readable surfaces** — `/llms.txt`, `/.well-known/mcp-index.json`, JSON-LD, and a per-server page for every indexed server (live count at [mcpindex.ai/stats](https://mcpindex.ai/stats)).

The gate is the wedge. The directory is the corpus the gate can query — also free.

## Develop

> Canonical local path: `/Volumes/GB990Pro/GBCode/mcpindex-web`.  
> If you also have `mcpindex-STALE-DO-NOT-DEPLOY/` (or an old `mcpindex/` clone), ignore it — it is a blocked backup, not the live site.

```bash
npm install
node scripts/sync-registry.mjs     # pull the registry: snapshot + removals + slug map
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
│   ├── server/[slug]/      # per-server pages (top-N SSG + ISR)
│   ├── best/[category]/    # curated category pages
│   └── ...                 # docs, trust, methodology, ledger, …
├── components/             # Header, Footer, DriftGateDemo, LiveTicker, …
├── lib/                    # registry, quality, search, verdicts, installs, …
├── scripts/                # sync-registry.mjs, build-slugmap.ts, honesty guard
├── data/                   # snapshot.json (committed) + snapshots/ (cron-written)
├── mcp-server-mcpindex/    # the npm-distributed MCP directory client
└── …
```

## License

- Web app code: source-available, all-rights-reserved (prevents direct fork-and-deploy by competitors).
- `mcp-server-mcpindex` (the npm package): MIT.
- MCP Quality Score methodology: open and PR-friendly.

## Affiliation

Unofficial. Not affiliated with Anthropic. The Model Context Protocol is open under MIT and trademarks remain with their owners. Server data comes from the official MCP registry.
