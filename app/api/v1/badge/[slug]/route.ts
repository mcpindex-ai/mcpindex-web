// Embeddable verdict badge (SVG). Reads the seeded verdict store via the SAME
// getVerdict() the site pages and the /api/v1/trust API use, so all three never
// disagree. Fail-closed: an unknown/invalid slug renders a gray "not screened"
// badge (HTTP 200) - never a broken image, never a fake pass. No server-
// controlled text reaches the SVG, so there is no injection surface.
//
// Embed (extension-less; GitHub's image proxy keys off Content-Type, like
// shields.io):
//   [![mcpindex](https://mcpindex.ai/api/v1/badge/<slug>)](https://mcpindex.ai/server/<slug>)

import type { NextRequest } from 'next/server';
import { getVerdict } from '@/lib/verdicts';
import { computeBadgeState, renderBadgeSvg } from '@/lib/badge';

export const revalidate = 300;

// Mirror the trust API's cap: defends edge cache against poison via long
// arbitrary slugs (max-age caches each distinct path).
const MAX_PARAM_LEN = 256;

function decodeSlug(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const d = decodeURIComponent(raw).trim();
    return d.length === 0 || d.length > MAX_PARAM_LEN ? null : d;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await ctx.params;
  const slug = decodeSlug(raw);
  const verdict = slug ? await getVerdict(slug) : null;
  const svg = renderBadgeSvg(computeBadgeState(verdict));
  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
