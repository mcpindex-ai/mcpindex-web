import type { IndexedServer } from '@/lib/types';
import { anchorProvenance } from '@/lib/provenance';

// Belt-and-suspenders URL-scheme guard. normalize() already strips non-http(s) at
// registry load; this guards any future code path that bypasses it, and keeps the
// JSON-LD builder from emitting a javascript:/data: URL as a link.
export function isSafeHref(u: string | undefined): u is string {
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
}

// Runtime platform derived ONLY from the packaging the registry actually recorded
// (never inferred from anything softer); undefined when unknown.
function runtimePlatformOf(server: IndexedServer): string | undefined {
  if (server.npmPackage) return 'Node.js';
  if (server.pypiPackage) return 'Python';
  if (server.dockerImage) return 'Docker';
  return undefined;
}

// Shape-aware structured data for a catalog server page. Deliberately NEVER emits an
// app-family @type (SoftwareApplication / WebApplication / MobileApplication / Product /
// VideoGame) at any nesting depth: Google's app rich result requires a user rating we cannot supply
// honestly for third-party servers, and a maturity heuristic dressed as stars would
// contradict the gate's "advisory, not a safety verdict" stance. We describe the server
// and point at its canonical entity via codeRepository/sameAs rather than impersonate it.
//   repo-backed -> SoftwareSourceCode (links the catalog entry to its source entity)
//   remote-only -> WebAPI (a callable endpoint, not source)
//   neither     -> WebPage about the server
/**
 * True when a "website" URL is actually an MCP endpoint: it equals the entry's
 * remote endpoint, or its path ends in the conventional /mcp or /sse transport
 * segments. An MCP endpoint is an API URL, not a web page - a browser GET
 * 4xxes even on live servers - so it must never be published as a navigable
 * website link (page anchor or JSON-LD sameAs).
 */
export function isEndpointShaped(url: string, remoteUrl?: string): boolean {
  if (remoteUrl && url === remoteUrl) return true;
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '');
    return p.endsWith('/mcp') || p.endsWith('/sse');
  } catch {
    return false;
  }
}

export function buildServerJsonLd(server: IndexedServer): Record<string, unknown> {
  const repoHref = isSafeHref(server.repositoryUrl) ? server.repositoryUrl : undefined;
  const siteHrefRaw = isSafeHref(server.websiteUrl) ? server.websiteUrl : undefined;
  const remoteHref = isSafeHref(server.remoteUrl) ? server.remoteUrl : undefined;
  const siteHref =
    siteHrefRaw && !isEndpointShaped(siteHrefRaw, remoteHref) ? siteHrefRaw : undefined;
  const url = `https://mcpindex.ai/server/${server.slug}`;
  const runtimePlatform = runtimePlatformOf(server);

  let entity: Record<string, unknown>;
  if (repoHref) {
    entity = {
      '@type': 'SoftwareSourceCode',
      name: server.title,
      alternateName: server.name,
      description: server.description,
      codeRepository: repoHref,
      softwareVersion: server.version,
      url,
      ...(runtimePlatform ? { runtimePlatform } : {}),
      sameAs: [repoHref, siteHref].filter((u): u is string => !!u),
    };
  } else if (remoteHref) {
    entity = {
      '@type': 'WebAPI',
      name: server.title,
      alternateName: server.name,
      description: server.description,
      url,
      sameAs: [remoteHref, siteHref].filter((u): u is string => !!u),
    };
  } else {
    entity = {
      '@type': 'WebPage',
      name: server.title,
      description: server.description,
      url,
    };
  }

  // Provenance for the machine audience. Search engines and answer engines read this
  // block and nothing else on the page, so a listing that carries no basis is, to them,
  // an unsourced assertion about a third party's software.
  //
  // Standard schema.org keys, not invented ones - `isBasedOn` names what the entry is
  // derived FROM, `citation` points at the method, `creativeWorkStatus` is where the
  // advisory posture belongs. A custom key would be ignored by every consumer and would
  // amount to writing provenance for ourselves.
  //
  // The anchor is included ONLY when a confirmed one exists (anchorProvenance returns
  // null for pending), so this can never assert settled provenance the ledger does not
  // have. `sameAs` deliberately stays untouched: it identifies the SERVER's own entity,
  // and mixing our proof URL into it would claim the proof is another identity for
  // someone else's project.
  const anchor = anchorProvenance();
  return {
    '@context': 'https://schema.org',
    ...entity,
    isBasedOn: 'https://registry.modelcontextprotocol.io',
    citation: 'https://mcpindex.ai/methodology',
    creativeWorkStatus: 'Advisory listing; semantic-only screen, not a safety verdict',
    ...(anchor
      ? {
          subjectOf: {
            '@type': 'CreativeWork',
            name: 'Verdict corpus anchor (OpenTimestamps / Bitcoin)',
            identifier: anchor.chain_root,
            url: anchor.verify,
            dateCreated: anchor.stamped_at,
          },
        }
      : {}),
  };
}
