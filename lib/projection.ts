import type { IndexedServer } from './types';
import { computeQuality } from './quality';

// Single source of truth for the public list-item shape shared by the discovery
// routes (/api/v1/search and /api/v1/servers). Kept here so the two routes can
// never drift on field names — search appends its own `score`/`matched`.
//
// PUBLISHED CONTRACT: these field names are consumed by external registry
// aggregators that pull /api/v1/servers (e.g. Mastra's mcp-registry-registry
// processMcpindexServers, which reads slug/name/title/description/updatedAt).
// Renaming or dropping a field here is a BREAKING change for those consumers,
// and their side fails silently (empty name/updatedAt). Treat additively.
export function toListItem(s: IndexedServer) {
  return {
    slug: s.slug,
    name: s.name,
    title: s.title,
    description: s.description,
    category: s.category,
    version: s.version,
    // Provenance, published as data. Without it an API consumer cannot tell a mirrored
    // registry listing from one mcpindex admitted editorially, which would let an
    // unlisted server read as registry-listed through this surface - the exact claim the
    // HTML page is careful never to make. Additive, so existing consumers are unaffected.
    source: s.source,
    ...(s.admittedReason ? { admittedReason: s.admittedReason } : {}),
    qualityScore: computeQuality(s).score,
    installs: {
      npm: s.npmPackage,
      pypi: s.pypiPackage,
      docker: s.dockerImage,
      remote: s.remoteUrl,
    },
    url: `https://mcpindex.ai/server/${s.slug}`,
    updatedAt: s.updatedAt,
  };
}
