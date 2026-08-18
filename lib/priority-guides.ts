/**
 * Crawl-priority guide URLs: pages we want Google to discover from already-
 * indexed surfaces (home, /install, /trust, /docs, footer, server CTAs).
 * Keep this list short — every addition dilutes equity on the first wave.
 */
export const PRIORITY_GUIDES = [
  {
    href: '/guides/mcp-silent-contract-drift',
    label: 'MCP rug pulls & silent contract drift',
  },
  {
    href: '/guides/mcp-lock',
    label: 'MCP needs a lockfile (mcp.lock)',
  },
  {
    href: '/guides/how-to-trust-an-mcp-server',
    label: 'How to trust an MCP server',
  },
  // "how to vet mcp servers" is the only winnable category query GSC shows us on the
  // board for (pos 43.6, 2026-08-01 export) and its guide had zero links from any
  // priority surface. Dilution cost of a 5th entry accepted for the one query with
  // measured demand.
  {
    href: '/guides/evaluate-before-install',
    label: 'How to vet MCP servers before you install',
  },
  {
    href: '/guides/screen-mcp-server-before-install',
    label: 'Screen an MCP server before install',
  },
  // "mcp 2.0" is a head term with obvious migration-season demand and zero
  // coverage anywhere on the site except the /stats panel. Dilution cost of a
  // 6th entry accepted for the same reason as the 5th.
  {
    href: '/guides/what-is-mcp-2-0',
    label: 'What is MCP 2.0? (the 2026-07-28 revision)',
  },
] as const;

export const GUIDES_HUB = { href: '/guides', label: 'All guides' } as const;
