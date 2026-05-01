import type { NextRequest } from 'next/server';
import { loadServers, loadSnapshot } from '@/lib/registry';

export const revalidate = 3600;

// /api/v1/diff?since=YYYY-MM-DD
// What's new / removed / version-changed since `since`.
// v0: derives "added" from publishedAt + "version-changed" from updatedAt > since
// against current snapshot. Real registry-state diffs require historical
// snapshots stored over time — Day-0 cron writes those into data/snapshots/.

export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get('since');
  if (!sinceParam) {
    return Response.json(
      { error: 'Missing required ?since=YYYY-MM-DD' },
      { status: 400 },
    );
  }
  const since = new Date(sinceParam);
  if (isNaN(since.getTime())) {
    return Response.json(
      { error: 'Invalid date — use YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const [servers, snap] = await Promise.all([loadServers(), loadSnapshot()]);

  const added = servers.filter((s) => new Date(s.publishedAt) > since);
  const updated = servers.filter(
    (s) =>
      new Date(s.updatedAt) > since && new Date(s.publishedAt) <= since,
  );

  return Response.json(
    {
      since: sinceParam,
      snapshotAt: snap.fetchedAt,
      counts: { added: added.length, updated: updated.length },
      added: added.slice(0, 100).map((s) => ({
        slug: s.slug,
        name: s.name,
        title: s.title,
        publishedAt: s.publishedAt,
        category: s.category,
        url: `https://mcpindex.ai/server/${s.slug}`,
      })),
      updated: updated.slice(0, 100).map((s) => ({
        slug: s.slug,
        name: s.name,
        version: s.version,
        updatedAt: s.updatedAt,
        url: `https://mcpindex.ai/server/${s.slug}`,
      })),
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    },
  );
}
