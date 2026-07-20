import type { IndexedServer } from '@/lib/types';

// The crawlable browse index over the full registry snapshot. Every server page
// gets at least one incoming internal link from here (Ahrefs 2026-07-20 flagged
// 5,287 server pages as orphans - reachable only via the sitemap). Ordering is
// ALPHABETICAL, not quality-ranked: a quality sort reshuffles page membership on
// every snapshot, which churns what each paginated URL contains and wastes the
// crawl budget the hub exists to spend well.
export const BROWSE_PAGE_SIZE = 120;

export interface BrowsePage {
  readonly items: readonly IndexedServer[];
  readonly page: number;
  readonly totalPages: number;
  readonly totalServers: number;
}

function browseSort(servers: readonly IndexedServer[]): IndexedServer[] {
  // slug is the tiebreaker so the order is total and deterministic even when
  // two registry entries share a display name.
  return [...servers].sort((a, b) => {
    const an = (a.title || a.name).toLowerCase();
    const bn = (b.title || b.name).toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
}

export function browseTotalPages(count: number): number {
  return Math.max(1, Math.ceil(count / BROWSE_PAGE_SIZE));
}

/** 1-indexed page over the alphabetized snapshot; null when out of range. */
export function browsePage(
  servers: readonly IndexedServer[],
  page: number,
): BrowsePage | null {
  const totalPages = browseTotalPages(servers.length);
  if (!Number.isInteger(page) || page < 1 || page > totalPages) return null;
  const sorted = browseSort(servers);
  const start = (page - 1) * BROWSE_PAGE_SIZE;
  return {
    items: sorted.slice(start, start + BROWSE_PAGE_SIZE),
    page,
    totalPages,
    totalServers: servers.length,
  };
}
