import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { loadServers } from '@/lib/registry';
import { browsePage, browseTotalPages } from '@/lib/serversBrowse';
import { ServersBrowse } from '@/components/ServersBrowse';

export const revalidate = 3600;

// Prerender the first pages (the crawl entry surface); the long tail renders
// on demand and is cached - same posture as server pages' PRERENDER_TOP_N.
const PRERENDER_PAGES = 10;

export async function generateStaticParams() {
  const servers = await loadServers();
  const total = Math.min(browseTotalPages(servers.length), PRERENDER_PAGES);
  // Page 1 lives at /servers; this route starts at 2.
  return Array.from({ length: Math.max(0, total - 1) }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ n: string }> },
): Promise<Metadata> {
  const { n } = await ctx.params;
  return {
    title: `All MCP servers · page ${n}`,
    description: `Alphabetized index of MCP servers from the official registry snapshot, page ${n}.`,
    alternates: { canonical: `https://mcpindex.ai/servers/page/${n}` },
  };
}

export default async function ServersPageN(
  ctx: { params: Promise<{ n: string }> },
) {
  const { n } = await ctx.params;
  if (!/^\d{1,4}$/.test(n)) notFound();
  const page = Number(n);
  if (page === 1) redirect('/servers'); // one canonical home for page 1
  const servers = await loadServers();
  const data = browsePage(servers, page);
  if (!data) notFound();
  return <ServersBrowse data={data} />;
}
