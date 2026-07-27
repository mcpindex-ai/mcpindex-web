import type { NextRequest } from 'next/server';
import { loadServers } from '@/lib/registry';

// Claimable-server finder for the owner-claim wizard's search picker.
//
// Why not /api/v1/search: that endpoint is relevance-ranked over ALL servers, so a query full of
// common tokens (e.g. "io.github.…" -> "github") floods the results with unrelated servers and
// buries the owner's own, AND surfaces servers with no HTTP remote (which are NOT claimable). This
// endpoint fixes both: it searches ONLY claimable servers (those with an HTTP remote) and ranks by
// how well the query matches the registry NAME/id first, so pasting a full id or a distinctive
// fragment ("mcpindex", "gautamgb") puts the owner's server at the top.
export const revalidate = 300;

const MAX_Q_LEN = 256;

type ClaimableEntry = { name: string; slug: string; title: string; remote: string; hay: string };

// Built once from the (memoized) registry load: the claimable subset with a lowercased haystack for
// matching. Cheap to rebuild if the module is cold; loadServers itself is memoized.
let _index: ClaimableEntry[] | null = null;
async function claimableIndex(): Promise<ClaimableEntry[]> {
  if (_index) return _index;
  const servers = (await loadServers()).filter((s) => s.source === 'registry');
  // /claim states that only registry-listed servers are claimable, and the ownership proof
  // is defined against a registry entry. Latent today (all admitted rows lack a remote).
  _index = servers
    .filter((s) => typeof s.remoteUrl === 'string' && s.remoteUrl.length > 0)
    .map((s) => ({
      name: s.name,
      slug: s.slug,
      title: s.title || s.name,
      remote: s.remoteUrl as string,
      hay: `${s.name} ${s.title ?? ''} ${s.slug} ${s.description ?? ''}`.toLowerCase(),
    }));
  return _index;
}

// Score a claimable entry against the query. Name/id matches dominate so the owner's own server
// (whose id contains the query) ranks first; token coverage handles partial/multi-word queries.
function score(e: ClaimableEntry, qLower: string, tokens: string[]): number {
  const nameL = e.name.toLowerCase();
  let s = 0;
  if (nameL === qLower) s += 5000; // exact id
  if (nameL.startsWith(qLower)) s += 500;
  if (nameL.includes(qLower)) s += 1000; // full query is a substring of the id
  if (e.hay.includes(qLower)) s += 100; // full query appears somewhere
  for (const t of tokens) if (nameL.includes(t)) s += 20;
  for (const t of tokens) if (e.hay.includes(t)) s += 5;
  return s;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const rawLimit = parseInt(req.nextUrl.searchParams.get('limit') ?? '', 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, rawLimit)) : 8;

  if (!q) {
    return Response.json(
      { error: 'Missing required ?q=<query>' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (q.length > MAX_Q_LEN) {
    return Response.json(
      { error: 'query too long' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const qLower = q.toLowerCase();
  // Split on non-alphanumerics so "io.github.gautamgb/mcp-server-mcpindex" -> its parts.
  const tokens = qLower.split(/[^a-z0-9]+/).filter(Boolean);
  const index = await claimableIndex();

  const results = index
    .map((e) => ({ e, s: score(e, qLower, tokens) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((r) => ({ name: r.e.name, slug: r.e.slug, title: r.e.title, remote: r.e.remote }));

  return Response.json(
    { query: q, total: results.length, results },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
        'X-Source': 'mcpindex.ai',
      },
    },
  );
}
