import type { MetadataRoute } from 'next';
import { loadServers } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';

export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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

  return [...staticRoutes, ...categoryRoutes, ...serverRoutes];
}
