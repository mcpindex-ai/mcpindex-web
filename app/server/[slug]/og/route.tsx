import { ImageResponse } from 'next/og';
import { getServer, loadServers } from '@/lib/registry';
import { getVerdict } from '@/lib/verdicts';
import { VerdictOg, OG_SIZE } from '@/lib/og';
import { isGoneSlug, resolveServerRedirect } from '@/lib/serverRemovals';

// Per-server share card. force-dynamic so it renders ON DEMAND (and is then
// CDN-cached), instead of pre-rendering 10k+ images at build time.
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const server = await getServer(slug);
  if (!server) {
    if (isGoneSlug(slug)) return new Response('gone', { status: 410 });
    const active = new Set((await loadServers()).map((s) => s.slug));
    const dest = resolveServerRedirect(slug, active);
    if (dest) {
      return Response.redirect(new URL(`/server/${dest}/og`, 'https://mcpindex.ai'), 308);
    }
    return new Response('not found', { status: 404 });
  }

  const verdict = await getVerdict(slug);
  const decision = verdict?.directive.decision ?? null;
  const rationale = verdict?.directive.rationale ?? '';

  return new ImageResponse(
    VerdictOg({ title: server.title, name: server.name, decision, rationale }),
    OG_SIZE,
  );
}
