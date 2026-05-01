import { NextRequest } from 'next/server';
import { getServer } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';

export const revalidate = 3600;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const s = await getServer(slug);
  if (!s) return Response.json({ error: 'not_found' }, { status: 404 });

  const { score, breakdown } = computeQuality(s);
  return Response.json(
    {
      slug: s.slug,
      name: s.name,
      title: s.title,
      description: s.description,
      version: s.version,
      category: s.category,
      publishedAt: s.publishedAt,
      updatedAt: s.updatedAt,
      qualityScore: score,
      qualityBreakdown: breakdown,
      installs: buildInstalls(s),
      envVars: s.envVars,
      repositoryUrl: s.repositoryUrl,
      websiteUrl: s.websiteUrl,
      remoteUrl: s.remoteUrl,
      url: `https://mcpindex.ai/server/${s.slug}`,
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
