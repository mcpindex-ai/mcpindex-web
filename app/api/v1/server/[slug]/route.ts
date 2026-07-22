import { NextRequest } from 'next/server';
import { getServer, loadServers } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';
import { getSourceLiveness, livenessRecommendation } from '@/lib/sourceLiveness';
import { isGoneSlug, resolveServerRedirect } from '@/lib/serverRemovals';

export const revalidate = 3600;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const s = await getServer(slug);
  if (!s) {
    if (isGoneSlug(slug)) {
      return Response.json(
        { error: 'gone' },
        {
          status: 410,
          headers: { 'Cache-Control': 'public, max-age=86400' },
        },
      );
    }
    const active = new Set((await loadServers()).map((s) => s.slug));
    const dest = resolveServerRedirect(slug, active);
    if (dest) {
      return Response.redirect(new URL(`/api/v1/server/${dest}`, 'https://mcpindex.ai'), 308);
    }
    // Cache 404s briefly so typo-storms don't bypass rate limits.
    return Response.json(
      { error: 'not_found' },
      {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=300' },
      },
    );
  }

  const { score, breakdown } = computeQuality(s);
  const installs = buildInstalls(s);
  // Phase A: deterministic fact, published as data only - it does NOT move
  // the verdict or the quality score (that's Phase B, behind a shadow
  // measurement). Omitted entirely when there's nothing corroborated to
  // report, because absence must not read as "verified healthy".
  const liveness = await getSourceLiveness(s.name);
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
      installs,
      envVars: s.envVars,
      ...(liveness
        ? {
            sourceLiveness: {
              ...liveness,
              recommendation: livenessRecommendation(installs.length > 0),
            },
          }
        : {}),
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
