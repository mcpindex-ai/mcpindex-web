import type { MetadataRoute } from 'next';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';
import { loadGuides } from '@/lib/guides-content';

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
      { url: `${base}/docs`, priority: 0.9, changeFrequency: 'monthly' },
      { url: `${base}/leaderboard`, priority: 0.9, changeFrequency: 'daily' },
      { url: `${base}/changelog`, priority: 0.9, changeFrequency: 'daily' },
      { url: `${base}/methodology`, priority: 0.7, changeFrequency: 'monthly' },
      { url: `${base}/about`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${base}/pricing`, priority: 0.4, changeFrequency: 'monthly' },
      { url: `${base}/stats`, priority: 0.6, changeFrequency: 'daily' },
    ];
    const categoryRoutes: MetadataRoute.Sitemap = ALL_CATEGORIES.map((c) => ({
      url: `${base}/best/${c}`,
      priority: 0.8,
      changeFrequency: 'weekly',
    }));
    const serverRoutes: MetadataRoute.Sitemap = servers.map((s) => ({
      url: `${base}/server/${s.slug}`,
      lastModified: new Date(s.updatedAt),
      priority: 0.6,
      changeFrequency: 'weekly',
    }));
    baseEntries = [...staticRoutes, ...categoryRoutes, ...serverRoutes];
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
