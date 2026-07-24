// Corpus meta badges for README social proof (not per-server verdicts).
//   [![servers](https://mcpindex.ai/api/v1/badge/meta/servers)](https://mcpindex.ai/stats)
//   [![screened](https://mcpindex.ai/api/v1/badge/meta/screened)](https://mcpindex.ai/stats)
//
// Counts match /.well-known/mcp-index.json (getServerCount + listScreened).

import type { NextRequest } from 'next/server';
import { getServerCount } from '@/lib/registry';
import { listScreened } from '@/lib/verdicts';
import { renderStatBadgeSvg, type MetaBadgeKind } from '@/lib/badge';

export const revalidate = 3600;

const KINDS = new Set<MetaBadgeKind>(['servers', 'screened']);
// Mirror /api/v1/badge/[slug]: bound path-param length so CDN keys stay finite.
const MAX_PARAM_LEN = 256;

function decodeKind(raw: string | undefined): MetaBadgeKind | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PARAM_LEN) return null;
  try {
    const d = decodeURIComponent(raw).trim().toLowerCase();
    if (d.length === 0 || d.length > MAX_PARAM_LEN) return null;
    return KINDS.has(d as MetaBadgeKind) ? (d as MetaBadgeKind) : null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind: raw } = await ctx.params;
  const kind = decodeKind(raw);
  if (!kind) {
    return new Response('Not found', { status: 404 });
  }

  const count =
    kind === 'servers' ? await getServerCount() : (await listScreened()).length;
  const svg = renderStatBadgeSvg(kind, count);

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Match /stats freshness: counts move with the daily snapshot, not per-verdict.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
