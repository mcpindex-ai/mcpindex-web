import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import type { IndexedServer } from '@/lib/types';
import { catalogPageFile, paginateCatalog, parseCatalogPageFile, renderCatalogPage } from '@/lib/llmsCatalog';
import type { CatalogPage } from '@/lib/llmsCatalog';

// One file of the per-server catalog, e.g. /llms-full/other-3.txt. /llms-full.txt lists them.
// Rendered on demand (no generateStaticParams, so no ISR writes per file); the edge cache comes
// from the Cache-Control header below, the same hourly TTL plus long SWR as /llms-full.txt, so
// a cold loadServers() parse stays off a fetcher's request path.

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

// Short edge TTL on the 404 so a sweep of well-formed but unknown names does not put a cold
// loadServers() parse behind every request.
function notFound(): Response {
  return new Response('Not found. Catalog files are listed in https://mcpindex.ai/llms-full.txt\n', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, s-maxage=300' },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const parsed = parseCatalogPageFile((await params).file);
  if (!parsed) return notFound();
  // Next hands over the decoded segment, so /llms-full/%6fther-1.txt parses as other-1.txt. One
  // spelling per file keeps it one edge-cache entry: anything else redirects to the canonical path.
  const canonical = `/llms-full/${catalogPageFile(parsed)}`;
  if (new URL(req.url).pathname !== canonical) {
    return Response.redirect(new URL(canonical, req.url), 308);
  }

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
