/**
 * Primary header nav, read as hook → browse → learn → act:
 * Scan (zero-commitment blast-radius tool) → Search (directory demand) →
 * Docs → Install. The `cta` item renders as a distinct button, not a peer
 * text link. MobileMenu consumes this same list, so one edit covers both.
 */
export const PRIMARY_NAV = [
  { href: '/scan', label: 'Scan' },
  { href: '/search', label: 'Search' },
  { href: '/docs', label: 'Docs' },
  { href: '/install', label: 'Install', cta: true },
] as const;
