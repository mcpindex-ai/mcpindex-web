import { loadServers, loadSnapshot } from '@/lib/registry';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export async function GET() {
  const [servers, snap] = await Promise.all([loadServers(), loadSnapshot()]);
  const sorted = [...servers]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, 100);

  const items = sorted
    .map((s) => {
      const link = `https://mcpindex.ai/server/${s.slug}`;
      const cat = CATEGORY_LABELS[s.category] ?? s.category;
      const title = `${s.title} (${s.name}@${s.version})`;
      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${new Date(s.publishedAt).toUTCString()}</pubDate>
      <category>${escapeXml(cat)}</category>
      <description>${escapeXml(s.description)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>mcpindex.ai · Changelog</title>
    <link>https://mcpindex.ai/changelog</link>
    <atom:link href="https://mcpindex.ai/changelog.rss" rel="self" type="application/rss+xml"/>
    <description>New and updated MCP servers indexed from the official MCP registry.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(snap.fetchedAt).toUTCString()}</lastBuildDate>
    <generator>mcpindex.ai</generator>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
