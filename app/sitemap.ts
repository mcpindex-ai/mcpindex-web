import type { MetadataRoute } from 'next';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';

export const revalidate = 86400;

let sitemapCache: { version: string; entries: MetadataRoute.Sitemap } | null = null;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const meta = await loadSnapshotMeta();
  if (sitemapCache && sitemapCache.version === meta.version) {
    return sitemapCache.entries;
  }

  const base = 'https://mcpindex.ai';
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

  const entries = [...staticRoutes, ...categoryRoutes, ...serverRoutes];
  sitemapCache = { version: meta.version, entries };
  return entries;
}
