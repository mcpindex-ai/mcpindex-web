import type { MetadataRoute } from 'next';
import { allFilms, thumbnailFor, FILM_UPLOAD_DATE } from '@/lib/films';
import { sitemapVideo } from '@/lib/video';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';
import { browseTotalPages } from '@/lib/serversBrowse';
import { eligibleTopics } from '@/lib/topics';
import { loadGuides } from '@/lib/guides-content';
import { DIAGRAMS } from '@/lib/diagrams';
import { UNREGISTERED } from '@/lib/unregistered';
import { driftReportEnabled } from '@/lib/reportStats';
import { ledgerEnabled } from '@/lib/ledger';

export const revalidate = 86400;

// Cache ONLY the registry-derived block (static + category + ~10k server URLs),
// keyed by snapshot version - that's the expensive part. Guides are published
// independently of the snapshot, so they must NOT be trapped behind the
// snapshot-version cache or a newly merged guide stays absent from the sitemap
// until the next registry refresh.
let baseCache: { version: string; entries: MetadataRoute.Sitemap } | null = null;

// The five queries tracked in tasks/growth/aeo-*.md map to these pages. Keep this set in
// step with that scorecard: a guide that is measured should be declared and recrawled
// like it matters.
const CORNERSTONE_GUIDES = new Set([
  'mcp-silent-contract-drift',
  'mcp-tool-trust-vs-authentication',
  'is-it-safe-to-let-an-ai-agent-call-an-mcp-tool',
  'how-to-trust-an-mcp-server',
  'audit-your-mcp-json-what-your-agent-can-do',
  // Head-term page for "mcp 2.0" / "2026-07-28" queries; the only page beyond
  // /stats that covers protocol eras, and the one carrying the probe command.
  'what-is-mcp-2-0',
  // Head pages for the tracked "how many change" / "how do I monitor drift" queries;
  // scorecard in tasks/growth/aeo-claude-baseline-2026-08-19/ (root repo).
  'how-many-mcp-servers-change-their-tools-after-publishing',
  'how-to-monitor-mcp-servers-for-tool-description-drift',
]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://mcpindex.ai';
  // CONCURRENT, not sequential. `loadSnapshot*` and `loadServers` both go through
  // resolveSnapshot(), whose `_resolveInflight` de-dup only covers CONCURRENT resolves -
  // awaiting them one after the other made a cold sitemap render read and zod-parse the
  // 26MB snapshot TWICE. This is the crawler's entry point, so it was the worst place in
  // the app to pay that. Hoisting loadServers() out of the cache-miss branch is free:
  // `baseCache` here and `_cache` in lib/registry are both module-scope, so they are warm
  // and cold together, and on a warm isolate loadServers() returns from `_cache` without
  // touching disk.
  const [meta, servers] = await Promise.all([loadSnapshotMeta(), loadServers()]);

  let baseEntries: MetadataRoute.Sitemap;
  if (baseCache && baseCache.version === meta.version) {
    baseEntries = baseCache.entries;
  } else {
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
      { url: `${base}/reliability`, priority: 0.5, changeFrequency: 'monthly' },
      { url: `${base}/brand`, priority: 0.3, changeFrequency: 'monthly' },
      { url: `${base}/diagrams`, priority: 0.7, changeFrequency: 'monthly' },
      { url: `${base}/ledger`, priority: 0.7, changeFrequency: 'hourly' },
      // The citable category page for MCP drift (frozen edition + live counters).
      // Guarded: the route 404s while the drift-report/ledger flags are off, and a
      // sitemap must never declare a URL that 404s.
      ...(driftReportEnabled() && ledgerEnabled()
        ? [{ url: `${base}/drift-report`, priority: 0.8, changeFrequency: 'daily' as const }]
        : []),
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
    // The two film pages, WITH the video-sitemap extension. Next 16 emits the
    // xmlns:video namespace itself when a route carries `videos`, so this needs no manual
    // urlset surgery (verified against node_modules/next/dist/docs .../metadata/sitemap.md).
    //
    // Priority 0.8, same as /demo: these are the pages that answer a question, and /demo
    // now canonicalises to them. This is the actual fix for "No video indexed: 1" -
    // ONE prominent video per URL, declared to the crawler rather than inferred from a
    // page carrying two co-equal players.
    const filmRoutes: MetadataRoute.Sitemap = allFilms().map(({ id, film }) => {
      const v = sitemapVideo(film, {
        uploadDate: FILM_UPLOAD_DATE,
        thumbnail: thumbnailFor(id),
      });
      return {
        url: v.loc,
        priority: 0.8,
        changeFrequency: 'monthly' as const,
        videos: [
          {
            title: v.title,
            thumbnail_loc: v.thumbnail_loc,
            description: v.description,
            content_loc: v.content_loc,
            duration: v.duration,
            publication_date: v.publication_date,
          },
        ],
      };
    });

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
      ...filmRoutes,
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
          // Cornerstone guides are the ones on the AEO scorecard: they are the pages we
          // actually measure and defend. Leaving every guide at a flat 0.5/monthly meant
          // the page carrying our only organic #1 was declared no more important, and
          // recrawled no more often, than any other. It was absent from the top 10 by
          // 2026-07-28. Everything else stays 0.5.
          priority: CORNERSTONE_GUIDES.has(g.slug) ? 0.8 : 0.5,
          changeFrequency: CORNERSTONE_GUIDES.has(g.slug)
            ? ('weekly' as const)
            : ('monthly' as const),
          ...(g.updated ? { lastModified: new Date(g.updated) } : {}),
        })),
      ]
    : [];

  // Head-name pages for widely requested servers with no vendor registry entry.
  // Static import, so listed outside the snapshot-version cache; 0.7 sits below
  // the cornerstone guides and above per-server pages - each answers a head
  // query ("is there an official X MCP server") no competing page answers.
  const unregisteredRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/unregistered`, priority: 0.6, changeFrequency: 'weekly' },
    ...UNREGISTERED.map((e) => ({
      url: `${base}/unregistered/${e.slug}`,
      priority: 0.7,
      changeFrequency: 'weekly' as const,
    })),
  ];

  return [...baseEntries, ...guideRoutes, ...unregisteredRoutes];
}
