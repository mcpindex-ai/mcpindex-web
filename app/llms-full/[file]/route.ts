import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import type { IndexedServer } from '@/lib/types';
import { catalogPageFile, paginateCatalog, parseCatalogPageFile, renderCatalogPage } from '@/lib/llmsCatalog';
import type { CatalogPage } from '@/lib/llmsCatalog';

// One file of the per-server catalog, e.g. /llms-full/other-3.txt. /llms-full.txt lists them.
// Prerendered with the same hourly ISR TTL as /llms-full.txt. Rendered on demand instead, Vercel
// strips s-maxage and stale-while-revalidate from a function response and clients saw only
// `Cache-Control: public`; a prerendered route keeps the header it sets.
export const revalidate = 3600;
// Unknown names get the site's static 404 without running this handler. Left at the default
// (true), every well-formed unknown name (zzz-7.txt) was rendered and then written to the ISR
// cache, so a sweep of made-up names turned into billed ISR writes.
export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ file: string }[]> {
  return paginateCatalog(await loadServers()).map((p) => ({ file: catalogPageFile(p) }));
}

// Pages are cut once per snapshot version, not per request. Keyed on the version so a data
// refresh that lands in a warm isolate re-cuts instead of serving the old page boundaries.
let paged: { version: string; byFile: Map<string, CatalogPage> } | null = null;

function pagesFor(version: string, servers: IndexedServer[]): Map<string, CatalogPage> {
  if (paged?.version === version) return paged.byFile;
  const byFile = new Map<string, CatalogPage>();
  for (const p of paginateCatalog(servers)) byFile.set(`${p.category}-${p.page}`, p);
  paged = { version, byFile };
  return byFile;
}

// Defensive only: with dynamicParams = false, Next answers unknown names before this runs.
function notFound(): Response {
  return new Response('Not found. Catalog files are listed in https://mcpindex.ai/llms-full.txt\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=300' },
  });
}

// The canonical-path 308 for percent-encoded spellings lives in proxy.ts: reading req.url here
// would opt this route out of prerendering.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const parsed = parseCatalogPageFile((await params).file);
  if (!parsed) return notFound();

  // loadServers() first so loadSnapshotMeta() reads the populated registry cache.
  const servers = await loadServers();
  const meta = await loadSnapshotMeta();
  const page = pagesFor(meta.version, servers).get(`${parsed.category}-${parsed.page}`);
  if (!page) return notFound();

  return new Response(renderCatalogPage(page, servers.length, meta.version), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-Snapshot-Version': meta.version,
    },
  });
}
