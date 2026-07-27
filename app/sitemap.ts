import type { MetadataRoute } from 'next';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';
import { browseTotalPages } from '@/lib/serversBrowse';
import { eligibleTopics } from '@/lib/topics';
import { loadGuides } from '@/lib/guides-content';
import { DIAGRAMS } from '@/lib/diagrams';

export const revalidate = 86400;

// Cache ONLY the registry-derived block (static + category + ~10k server URLs),
// keyed by snapshot version - that's the expensive part. Guides are published
// independently of the snapshot, so they must NOT be trapped behind the
// snapshot-version cache or a newly merged guide stays absent from the sitemap
// until the next registry refresh.
let baseCache: { version: string; entries: MetadataRoute.Sitemap } | null = null;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://mcpindex.ai';
  const meta = await loadSnapshotMeta();

  let baseEntries: MetadataRoute.Sitemap;
  if (baseCache && baseCache.version === meta.version) {
    baseEntries = baseCache.entries;
  } else {
    const servers = await loadServers();
    const staticRoutes: MetadataRoute.Sitemap = [
      { url: `${base}/`, priority: 1.0, changeFrequency: 'daily' },
      { url: `${base}/search`, priority: 0.8, changeFrequency: 'monthly' },
      { url: `${base}/docs`, priority: 0.9, changeFrequency: 'monthly' },
      { url: `${base}/leaderboard`, priority: 0.9, changeFrequency: 'daily' },
      { url: `${base}/changelog`, priority: 0.9, changeFrequency: 'daily' },
      { url: `${base}/methodology`, priority: 0.7, changeFrequency: 'monthly' },
      { url: `${base}/whitepaper`, priority: 0.8, changeFrequency: 'monthly' },
      { url: `${base}/trust`, priority: 0.8, changeFrequency: 'monthly' },
      { url: `${base}/demo`, priority: 0.8, changeFrequency: 'monthly' },
      { url: `${base}/about`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${base}/which-mcpindex`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${base}/stats`, priority: 0.6, changeFrequency: 'daily' },
      { url: `${base}/status`, priority: 0.4, changeFrequency: 'daily' },
      { url: `${base}/brand`, priority: 0.3, changeFrequency: 'monthly' },
      { url: `${base}/diagrams`, priority: 0.7, changeFrequency: 'monthly' },
      { url: `${base}/ledger`, priority: 0.7, changeFrequency: 'hourly' },
      { url: `${base}/dashboard`, priority: 0.5, changeFrequency: 'hourly' },
      { url: `${base}/research/source-liveness`, priority: 0.8, changeFrequency: 'weekly' },
      { url: `${base}/screen`, priority: 0.8, changeFrequency: 'monthly' },
      { url: `${base}/scan`, priority: 0.8, changeFrequency: 'monthly' },
      { url: `${base}/install`, priority: 0.9, changeFrequency: 'monthly' },
      { url: `${base}/best`, priority: 0.7, changeFrequency: 'weekly' },
      { url: `${base}/privacy`, priority: 0.3, changeFrequency: 'yearly' },
      { url: `${base}/terms`, priority: 0.3, changeFrequency: 'yearly' },
      { url: `${base}/accessibility`, priority: 0.3, changeFrequency: 'yearly' },
    ];
    // Individual figure permalinks sit deliberately LOW. lib/priority-guides.ts already makes
    // the point: every URL added to a crawl wave dilutes equity on the pages that convert. The
    // gallery hub is the crawlable entry point; the 17 leaves are for reuse and citation, not
    // for competing with /install and /trust over crawl budget.
    const diagramRoutes: MetadataRoute.Sitemap = DIAGRAMS.map((d) => ({
      url: `${base}/diagrams/${d.id}`,
      priority: 0.4,
      changeFrequency: 'monthly',
    }));
    const categoryRoutes: MetadataRoute.Sitemap = ALL_CATEGORIES.map((c) => ({
      url: `${base}/best/${c}`,
      priority: 0.8,
      changeFrequency: 'weekly',
    }));
    // The A-Z browse hub: page 1 at /servers, the rest under /servers/page/n.
    // These give every server page a crawlable incoming internal link.
    const browsePages = browseTotalPages(servers.length);
    const browseRoutes: MetadataRoute.Sitemap = [
      { url: `${base}/servers`, priority: 0.6, changeFrequency: 'daily' },
      ...Array.from({ length: Math.max(0, browsePages - 1) }, (_, i) => ({
        url: `${base}/servers/page/${i + 2}`,
        priority: 0.3,
        changeFrequency: 'weekly' as const,
      })),
    ];
    const serverRoutes: MetadataRoute.Sitemap = servers.map((s) => ({
      url: `${base}/server/${s.slug}`,
      lastModified: new Date(s.updatedAt),
      priority: 0.6,
      changeFrequency: 'weekly',
    }));
    // Topic comparison pages. Priority above per-server pages: they answer a question no
    // competing page answers, where a server page is one of seven near-identical listings.
    // Derived from eligibleTopics so a topic that stops clearing the bar leaves the sitemap
    // in the same pass that makes its route 404.
    const compareRoutes: MetadataRoute.Sitemap = eligibleTopics(servers).map((t) => ({
      url: `${base}/compare/${t}`,
      priority: 0.8,
      changeFrequency: 'weekly',
    }));
    baseEntries = [
      ...staticRoutes,
      ...diagramRoutes,
      ...categoryRoutes,
      ...compareRoutes,
      ...browseRoutes,
      ...serverRoutes,
    ];
    baseCache = { version: meta.version, entries: baseEntries };
  }

  // read fresh every call so a merged guide is discoverable immediately. The
  // /guides index is listed only when it has content (it is noindex while empty).
  const guides = await loadGuides();
  const guideRoutes: MetadataRoute.Sitemap = guides.length
    ? [
        { url: `${base}/guides`, priority: 0.6, changeFrequency: 'weekly' },
        ...guides.map((g) => ({
          url: `${base}/guides/${g.slug}`,
          priority: 0.5,
          changeFrequency: 'monthly' as const,
          ...(g.updated ? { lastModified: new Date(g.updated) } : {}),
        })),
      ]
    : [];

  return [...baseEntries, ...guideRoutes];
}
