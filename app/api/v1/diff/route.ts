import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';

export const revalidate = 3600;

// Accept either YYYY-MM-DD or a full ISO 8601 timestamp with offset.
// Strict parsing: Invalid Date strings are rejected with 400 before compare.
const SinceZ = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

// /api/v1/diff?since=YYYY-MM-DD
// What's new / removed / version-changed since `since`.
// v0: derives "added" from publishedAt + "version-changed" from updatedAt > since
// against current snapshot. snapshot_version + snapshot_written_at let
// consumers detect staleness.

export async function GET(req: NextRequest) {
  const sinceParam = req.nextUrl.searchParams.get('since');
  if (!sinceParam) {
    return Response.json(
      { error: 'Missing required ?since=YYYY-MM-DD' },
      { status: 400 },
    );
  }
  const parsed = SinceZ.safeParse(sinceParam);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid date - use YYYY-MM-DD or ISO 8601 with offset' },
      { status: 400 },
    );
  }
  const since = new Date(parsed.data);

  const [servers, meta] = await Promise.all([loadServers(), loadSnapshotMeta()]);

  const added = servers.filter((s) => new Date(s.publishedAt) > since);
  const updated = servers.filter(
    (s) =>
      new Date(s.updatedAt) > since && new Date(s.publishedAt) <= since,
  );

  return Response.json(
    {
      since: sinceParam,
      snapshotAt: meta.fetchedAt,
      snapshot_version: meta.version,
      snapshot_written_at: meta.writtenAt,
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
