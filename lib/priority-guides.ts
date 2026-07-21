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
  {
    href: '/guides/screen-mcp-server-before-install',
    label: 'Screen an MCP server before install',
  },
] as const;

export const GUIDES_HUB = { href: '/guides', label: 'All guides' } as const;
