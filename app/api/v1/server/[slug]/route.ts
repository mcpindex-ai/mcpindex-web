import { NextRequest } from 'next/server';
import { getServer, legacySlugRedirects, loadServers } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';
import { getSourceLiveness, sourceLivenessField } from '@/lib/sourceLiveness';
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
    const servers = await loadServers();
    const active = new Set(servers.map((s) => s.slug));
    const dest = resolveServerRedirect(slug, active, legacySlugRedirects(servers));
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

  // Omitted entirely when there's nothing corroborated to report, because absence must
  // not read as "verified healthy".
  //
  // This block used to carry "published as data only - it does NOT move the verdict or
  // the quality score (that's Phase B, behind a shadow measurement)". Phase B is now
  // shipped for the SCORE only: a corroborated-unreachable source withholds the two
  // repo-derived credits (see lib/quality.ts). The shadow measurement it was waiting on
  // was to size the impact, and the impact is deterministic and already known - 1,915 of
  // 20,102 listings, -10 each - so it was measured directly instead. The VERDICT is
  // still untouched by liveness, which was always the load-bearing half of that promise.
  const liveness = await getSourceLiveness(s.name);
  const { score, breakdown } = computeQuality(s, liveness);
  const installs = buildInstalls(s);
  return Response.json(
    {
      slug: s.slug,
      name: s.name,
      title: s.title,
      description: s.description,
      version: s.version,
      category: s.category,
      // Provenance, published as data - see lib/projection.ts. An admitted server is not
      // in the official MCP registry, and an API consumer has no other way to know that.
      source: s.source,
      ...(s.admittedReason ? { admittedReason: s.admittedReason } : {}),
      publishedAt: s.publishedAt,
      updatedAt: s.updatedAt,
      qualityScore: score,
      qualityBreakdown: breakdown,
      installs,
      envVars: s.envVars,
      // Shared with the list surfaces. The predicate inside is `hasPackage`, NOT the
      // `installs.length > 0` this route used to pass: buildInstalls() counts the remote
      // endpoint as an install target, so the old form was true for every remote-only
      // server and told those callers to "pin version and review" a source that was never
      // the executing artifact - inverting the one distinction the field exists to draw.
      ...sourceLivenessField(s, liveness),
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
