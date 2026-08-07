import type { IndexedServer } from './types';
import { computeQuality } from './quality';
// NOTE: this is a VALUE import, so this module is now transitively `server-only`. That is
// a real coupling change - the shared public-API shape can no longer be imported from a
// client component or from a test running without --conditions=react-server. Every caller
// of toListItem today is a server route, so this is sound; move sourceLivenessField if
// that ever stops being true.
import { sourceLivenessField, type SourceLiveness } from './sourceLiveness';

// Single source of truth for the public list-item shape shared by the discovery
// routes (/api/v1/search and /api/v1/servers). Kept here so the two routes can
// never drift on field names — search appends its own `score`/`matched`.
//
// PUBLISHED CONTRACT: these field names are consumed by external registry
// aggregators that pull /api/v1/servers (e.g. Mastra's mcp-registry-registry
// processMcpindexServers, which reads slug/name/title/description/updatedAt).
// Renaming or dropping a field here is a BREAKING change for those consumers,
// and their side fails silently (empty name/updatedAt). Treat additively.
//
// `liveness` is required for the same reason it is required in computeQuality: it feeds
// the qualityScore below, and a list surface that ships the number without the caveat is
// how an agent reads "QS 90/100" for a server whose source this site has already
// published as unreachable. Pass null only when there is genuinely nothing on file.
export function toListItem(s: IndexedServer, liveness: SourceLiveness | null) {
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
    qualityScore: computeQuality(s, liveness).score,
    // ADDITIVE, and omitted entirely when nothing is on file - absence is not
    // "verified healthy", so an always-present field with a healthy-looking default
    // would be a fabricated all-clear on 18,000 listings. Shared builder, so the detail
    // and list surfaces cannot drift by construction rather than by comment.
    ...sourceLivenessField(s, liveness),
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
