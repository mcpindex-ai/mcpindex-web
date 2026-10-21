import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { buildProvenance, CATALOG_BASIS } from '@/lib/provenance';
import { classifyDiff, loadFirstSeen } from '@/lib/registryDiff';

export const revalidate = 3600;

// Response page size. Named rather than inline so the cap and the `truncated` flag that
// declares it cannot drift apart.
const PAGE_LIMIT = 100;

// Accept either YYYY-MM-DD or a full ISO 8601 timestamp with offset.
// Strict parsing: Invalid Date strings are rejected with 400 before compare.
const SinceZ = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

// /api/v1/diff?since=YYYY-MM-DD
// added: server names first seen at or after `since`. updated: names seen before `since` whose
// latest version was published (or record updated) at or after it. First-seen dates come from
// data/first-seen.json; see lib/registryDiff.ts. snapshot_version + snapshot_written_at let
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

  const [servers, meta, firstSeen] = await Promise.all([
    loadServers(),
    loadSnapshotMeta(),
    loadFirstSeen(),
  ]);

  const { added, updated, limits } = classifyDiff(servers, firstSeen, since);

  return Response.json(
    {
      since: sinceParam,
      snapshotAt: meta.fetchedAt,
      snapshot_version: meta.version,
      snapshot_written_at: meta.writtenAt,
      counts: { added: added.length, updated: updated.length },
      // The arrays below are capped at PAGE_LIMIT while `counts` reports the true totals.
      // Stated on the wire rather than left for a consumer to infer from a length check:
      // an array that silently stops at 100 reads as "that was all of them", and a client
      // diffing the registry would under-report every busy week without ever erroring.
      truncated: {
        limit: PAGE_LIMIT,
        added: added.length > PAGE_LIMIT,
        updated: updated.length > PAGE_LIMIT,
      },
      provenance: buildProvenance({
        basis: CATALOG_BASIS,
        // Specific to THIS endpoint: it reports registry churn from the publishedAt stamps of
        // the snapshots it has kept, not from watching registry events as they happened.
        limits: ['derived_from_snapshot_timestamps_not_observed_events', ...limits],
        snapshot: { version: meta.version, written_at: meta.writtenAt },
      }),
      added: added.slice(0, PAGE_LIMIT).map((s) => ({
        slug: s.slug,
        name: s.name,
        title: s.title,
        publishedAt: s.publishedAt,
        category: s.category,
        url: `https://mcpindex.ai/server/${s.slug}`,
      })),
      updated: updated.slice(0, PAGE_LIMIT).map((s) => ({
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
