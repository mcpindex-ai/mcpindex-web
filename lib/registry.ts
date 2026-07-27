import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  AdmittedEntry,
  IndexedServer,
  RegistryEntry,
  RegistryResponse,
  RegistryServer,
  ServerSource,
  Snapshot,
} from './types';
import { loadAdmitted } from './admitted';
import { categorize } from './categorize';
import { SnapshotZ } from './snapshotSchema';
import {
  readKVSnapshot,
  snapshotVersion,
  type StoredSnapshot,
} from './snapshotStore';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0/servers';
const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'snapshot.json');

// Slug: name "vendor.domain/sub" -> "vendor-domain--sub", reversible-ish.
// Lossy: case, `_`, and `/`/`.` separators can collapse distinct names onto one
// base slug. Callers that index by slug MUST run disambiguateSlugs() (or
// loadServers) so colliding subjects never share a public identity.
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replaceAll('/', '--')
    .replaceAll('.', '-')
    .replaceAll('@', '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug) return slug;
  // Names that contain only non-slug characters would collapse to ''.
  // Fall back to a deterministic hash so the index never carries an empty slug.
  return 'srv-' + createHash('sha256').update(name).digest('hex').slice(0, 12);
}

// When slugify() maps two distinct names to the same base, append a short hash of
// the *name* to EVERY member of the colliding set. Retires the ambiguous bare
// slug rather than first-wins (which would misattribute trust verdicts).
export function disambiguateSlugs(servers: IndexedServer[]): IndexedServer[] {
  const byBase = new Map<string, IndexedServer[]>();
  for (const s of servers) {
    const group = byBase.get(s.slug);
    if (group) group.push(s);
    else byBase.set(s.slug, [s]);
  }
  const out: IndexedServer[] = [];
  for (const [base, group] of byBase) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    for (const s of group) {
      const hash = createHash('sha256').update(s.name).digest('hex').slice(0, 12);
      out.push({ ...s, slug: `${base}-${hash}` });
    }
  }
  return out;
}

function safeUrl(u: string | undefined): string | undefined {
  if (!u) return undefined;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? u
      : undefined;
  } catch {
    return undefined;
  }
}

// Shared field mapping for both provenances. Registry entries read their dates and status
// from the official _meta block; admitted entries carry their own, because stamping them
// with a registry block would have them claim listing they do not have (see lib/admitted.ts).
function normalizeServer(
  s: RegistryServer,
  meta: { status: string; publishedAt: string; updatedAt: string },
  source: ServerSource,
  admittedReason?: string,
): IndexedServer {
  const remote = s.remotes?.[0];
  const npmPkg = s.packages?.find((p) => p.registryType === 'npm');
  const pypiPkg = s.packages?.find((p) => p.registryType === 'pypi');
  const dockerPkg = s.packages?.find(
    (p) => p.registryType === 'docker' || p.registryType === 'oci',
  );
  const primary = remote ?? s.packages?.[0];
  return {
    source,
    ...(admittedReason ? { admittedReason } : {}),
    slug: slugify(s.name),
    name: s.name,
    title: s.title || s.name,
    description: s.description ?? '',
    version: s.version,
    category: categorize(s.name, s.description ?? ''),
    publishedAt: meta.publishedAt,
    updatedAt: meta.updatedAt,
    status: meta.status,
    hasRemote: !!remote,
    hasPackage: !!s.packages?.length,
    primaryTransport: primary
      ? 'type' in primary
        ? primary.type
        : (primary.transport?.type ?? null)
      : null,
    npmPackage: npmPkg?.identifier,
    pypiPackage: pypiPkg?.identifier,
    dockerImage: dockerPkg?.identifier,
    remoteUrl: safeUrl(remote?.url),
    repositoryUrl: safeUrl(s.repository?.url),
    websiteUrl: safeUrl(s.websiteUrl),
    iconUrl: safeUrl(s.icons?.[0]?.src),
    envVars:
      s.packages?.flatMap((p) => p.environmentVariables ?? []) ?? [],
  };
}

export function normalize(entry: RegistryEntry): IndexedServer {
  return normalizeServer(
    entry.server,
    entry._meta['io.modelcontextprotocol.registry/official'],
    'registry',
  );
}

/**
 * Append editorially admitted servers (lib/admitted.ts) to the registry-derived set.
 *
 * Two invariants, both about not breaking what already works:
 *  - Admitted rows go LAST, so the name-dedup downstream always resolves a tie in the
 *    registry's favour.
 *  - An admitted row whose base slug already belongs to a registry listing is DROPPED,
 *    not disambiguated. disambiguateSlugs() hashes every member of a colliding set, so
 *    resolving the collision would rename a live /server/<slug> URL. A missing overlay
 *    row is recoverable; a moved public URL is not.
 */
/** Identity keys that survive a rename: what the server IS, not what it is called.
 *
 * A package identifier ALONE is not an identity in an open-publish registry - 513 identifiers
 * in the current snapshot are claimed by more than one distinct entry (pypi:clio-kit by 23).
 * Identifier-alone would therefore be a delisting vector: anyone publishing an entry that
 * declares an admitted server's package would silently remove it from the index. So a package
 * key is qualified by the repository it ships from, and only the remote URL - which is the
 * running artifact itself - stands alone. */
function identityKeys(s: IndexedServer): string[] {
  const keys: string[] = [];
  const repo = s.repositoryUrl
    ? s.repositoryUrl.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
    : '';
  if (repo) {
    if (s.npmPackage) keys.push(`npm:${s.npmPackage.toLowerCase()}@${repo}`);
    if (s.pypiPackage) keys.push(`pypi:${s.pypiPackage.toLowerCase()}@${repo}`);
    if (s.dockerImage) keys.push(`oci:${s.dockerImage.toLowerCase().split(':')[0]}@${repo}`);
  }
  if (s.remoteUrl) keys.push(`remote:${s.remoteUrl.toLowerCase().replace(/\/+$/, '')}`);
  return keys;
}

export function mergeAdmitted(
  registryServers: readonly IndexedServer[],
  admittedServers: readonly IndexedServer[],
): IndexedServer[] {
  const registryBaseSlugs = new Set(registryServers.map((s) => s.slug));
  // Name equality only catches byte-identical republication. When upstream publishes a
  // server we admitted, it will very likely use a DIFFERENT name (the reference servers live
  // in one monorepo), so the slug differs, nothing collides, and BOTH rows survive: two pages
  // for one subject, and the admitted one keeps asserting "not listed in the official MCP
  // registry" about a server that now is. Package identifier and remote URL survive a rename;
  // the name does not.
  const registryIdentities = new Set(registryServers.flatMap(identityKeys));
  const admitted = admittedServers
    .filter((s) => s.description && s.name && s.slug)
    .filter((s) => {
      const dupe = identityKeys(s).find((k) => registryIdentities.has(k));
      if (dupe) {
        console.warn('[admitted] dropped, upstream now lists this server under another name', {
          name: s.name,
          matchedOn: dupe,
        });
        return false;
      }
      if (!registryBaseSlugs.has(s.slug)) return true;
      console.warn('[admitted] dropped, slug collides with a registry listing', {
        name: s.name,
        slug: s.slug,
      });
      return false;
    });
  return [...registryServers, ...admitted];
}

export function normalizeAdmitted(entry: AdmittedEntry): IndexedServer {
  return normalizeServer(
    entry.server,
    { status: 'active', publishedAt: entry.admitted.publishedAt, updatedAt: entry.admitted.updatedAt },
    'admitted',
    entry.admitted.reason,
  );
}

type LoadedSnapshot = {
  snapshot: Snapshot;
  version: string;
  writtenAt: string;
};

let _cache: { servers: IndexedServer[]; loaded: LoadedSnapshot } | null = null;

// Exported so /api/cron/sync-registry can republish the COMMITTED snapshot into KV without
// re-fetching upstream (which cannot finish inside maxDuration). Reads the file every call -
// no cache - so a manual refresh always publishes what is actually on disk right now.
export async function readBundledSnapshot(): Promise<StoredSnapshot> {
  const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
  const json: unknown = JSON.parse(raw);
  const parsed = SnapshotZ.safeParse(json);
  if (!parsed.success) {
    // Fail loud: never serve a stale _cache against a corrupted snapshot.
    console.error('registry: bundled snapshot schema failure', parsed.error.message);
    throw new Error('snapshot schema invalid');
  }
  const data = parsed.data as StoredSnapshot;
  return {
    fetchedAt: data.fetchedAt,
    totalEntries: data.totalEntries,
    servers: data.servers as RegistryEntry[],
    snapshot_version: data.snapshot_version ?? snapshotVersion(data.servers as RegistryEntry[]),
    snapshot_written_at: data.snapshot_written_at ?? data.fetchedAt,
  };
}

let _resolveInflight: Promise<LoadedSnapshot> | null = null;

// De-dup concurrent cold resolves. N simultaneous callers on a cold instance would otherwise EACH
// pull the ~21MB KV snapshot and zod-parse ~16k entries (~200MB transient apiece) -> OOM/500s under
// a traffic spike or parallel crawl. Sharing one resolve also fixes a body/version mismatch: every
// concurrent cold caller then converges on the SAME winning snapshot, so `servers` and `version`
// (read separately by loadServers vs loadSnapshotMeta) can never come from two different KV reads.
function resolveSnapshot(): Promise<LoadedSnapshot> {
  if (_resolveInflight) return _resolveInflight;
  _resolveInflight = resolveSnapshotUncached().finally(() => {
    _resolveInflight = null;
  });
  return _resolveInflight;
}

// KV wins over the bundled snapshot when present. That preference is safe ONLY because
// writeKVSnapshot now sets a 6h TTL (snapshotStore.KV_TTL_SECONDS): a KV blob can be at
// most one missed 4h sync behind the committed snapshot, and then it expires and the
// bundled file takes over. Deliberately NOT doing a written_at comparison of the two:
// that would require reading AND zod-parsing the 24.5MB bundled snapshot on every cold
// resolve in addition to the ~21MB KV blob, which is the exact double-parse that caused
// the OOM the _resolveInflight dedup above exists to prevent. Bounded staleness is the
// cheaper correct answer here; revisit only if the sync cadence goes above the TTL.
async function resolveSnapshotUncached(): Promise<LoadedSnapshot> {
  const kv = await readKVSnapshot();
  if (kv) {
    const parsed = SnapshotZ.safeParse(kv);
    if (!parsed.success) {
      console.error('registry: KV snapshot schema failure, falling back', parsed.error.message);
    } else {
      return {
        snapshot: {
          fetchedAt: kv.fetchedAt,
          totalEntries: kv.totalEntries,
          servers: kv.servers,
        },
        version: kv.snapshot_version,
        writtenAt: kv.snapshot_written_at,
      };
    }
  }
  const bundled = await readBundledSnapshot();
  return {
    snapshot: {
      fetchedAt: bundled.fetchedAt,
      totalEntries: bundled.totalEntries,
      servers: bundled.servers,
    },
    version: bundled.snapshot_version,
    writtenAt: bundled.snapshot_written_at,
  };
}

export async function loadSnapshot(): Promise<Snapshot> {
  if (_cache) return _cache.loaded.snapshot; // warm short-circuit (mirror loadServers/loadSnapshotMeta):
  // without this, a caller that ever went dynamic would re-resolve the 21MB snapshot per request.
  const loaded = await resolveSnapshot();
  return loaded.snapshot;
}

export async function loadSnapshotMeta(): Promise<{ version: string; writtenAt: string; fetchedAt: string }> {
  if (_cache) {
    return {
      version: _cache.loaded.version,
      writtenAt: _cache.loaded.writtenAt,
      fetchedAt: _cache.loaded.snapshot.fetchedAt,
    };
  }
  const loaded = await resolveSnapshot();
  return {
    version: loaded.version,
    writtenAt: loaded.writtenAt,
    fetchedAt: loaded.snapshot.fetchedAt,
  };
}

export async function loadServers(): Promise<IndexedServer[]> {
  if (_cache) return _cache.servers;
  const loaded = await resolveSnapshot();
  const filtered = loaded.snapshot.servers
    .filter(
      (e) =>
        e._meta['io.modelcontextprotocol.registry/official'].status ===
        'active',
    )
    .map(normalize)
    .filter((s) => s.description && s.name && s.slug);
  const merged = mergeAdmitted(filtered, (await loadAdmitted()).servers.map(normalizeAdmitted));

  // Dedup by name first (publisher isLatest regressions / crawler dupes; first wins).
  const seenName = new Set<string>();
  const uniqueByName = merged.filter((s) =>
    seenName.has(s.name) ? false : (seenName.add(s.name), true),
  );
  // Then disambiguate slugify collisions so distinct names never share a public slug
  // (trust verdicts are keyed by slug — a shared slug is wrong-subject PASS).
  const disambiguated = disambiguateSlugs(uniqueByName);
  const seenSlug = new Set<string>();
  const servers = disambiguated.filter((s) =>
    seenSlug.has(s.slug) ? false : (seenSlug.add(s.slug), true),
  );
  _cache = { servers, loaded };
  // Return from _cache (not the local `servers`) so a caller's servers and a later loadSnapshotMeta()
  // version always come from the same winning snapshot even if a concurrent cold caller reassigned _cache.
  return _cache.servers;
}

// Resolve a deprecated registry entry by the public slug it would have had while
// active, without folding deprecated subjects into loadServers() (browse/sitemap/
// leaderboard stay active-only) and without re-running set-wide disambiguation
// against active servers (that would renumber live URLs when a deprecated twin
// appears). Ahrefs 2026-07-22: active→deprecated left /server/<slug> as soft-404s.
export function findDeprecatedServer(
  slug: string,
  entries: RegistryEntry[],
  activeSlugs: ReadonlySet<string>,
): IndexedServer | null {
  const filtered = entries
    .filter(
      (e) =>
        e._meta['io.modelcontextprotocol.registry/official'].status ===
        'deprecated',
    )
    .map(normalize)
    .filter((s) => s.description && s.name && s.slug);
  const seenName = new Set<string>();
  const uniqueByName = filtered.filter((s) =>
    seenName.has(s.name) ? false : (seenName.add(s.name), true),
  );

  // Assign slugs among deprecated only. A bare slug already owned by an active
  // server is hashed so we never alias a live subject; collisions inside the
  // deprecated set are hashed the same way disambiguateSlugs does.
  const byBase = new Map<string, IndexedServer[]>();
  for (const s of uniqueByName) {
    const group = byBase.get(s.slug);
    if (group) group.push(s);
    else byBase.set(s.slug, [s]);
  }
  const resolved: IndexedServer[] = [];
  for (const [base, group] of byBase) {
    const mustHash = group.length > 1 || activeSlugs.has(base);
    if (!mustHash) {
      resolved.push(group[0]!);
      continue;
    }
    for (const s of group) {
      const hash = createHash('sha256').update(s.name).digest('hex').slice(0, 12);
      resolved.push({ ...s, slug: `${base}-${hash}` });
    }
  }
  return resolved.find((s) => s.slug === slug) ?? null;
}

export async function getServer(slug: string): Promise<IndexedServer | null> {
  const servers = await loadServers();
  const hit = servers.find((s) => s.slug === slug);
  if (hit) return hit;
  // Warm path: loadSnapshot() is free once loadServers() filled _cache.
  const snapshot = await loadSnapshot();
  return findDeprecatedServer(
    slug,
    snapshot.servers,
    new Set(servers.map((s) => s.slug)),
  );
}

export async function getServerCount(): Promise<number> {
  // REGISTRY-SOURCED ONLY. /stats and /api/v1/registry-count publish this number under an
  // explicit claim - "active entries in the official registry ... not self-submitted
  // listings" - and loadServers() now also returns editorially admitted servers. Counting
  // those here would make a published, checkable claim quietly false. The stats page's whole
  // value is that its method is stated and verifiable, so the filter belongs here rather than
  // a caveat on every surface that quotes it.
  return (await loadServers()).filter((s) => s.source === 'registry').length;
}

export async function getCategoryCount(): Promise<number> {
  // Registry-only for the same reason as getServerCount: /api/v1/registry-count publishes
  // this next to source: 'registry.modelcontextprotocol.io'.
  const servers = (await loadServers()).filter((s) => s.source === 'registry');
  return new Set(servers.map((s) => s.category)).size;
}

// Live fetcher used by the cron sync. Bypasses snapshot.
export async function fetchAllPages(maxPages = 200): Promise<RegistryEntry[]> {
  const all: RegistryEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL(REGISTRY_BASE);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Registry fetch failed: ${res.status}`);
    }
    const json = (await res.json()) as RegistryResponse;
    all.push(...json.servers);
    cursor = json.metadata?.nextCursor;
    if (!cursor) break;
  }
  return all;
}
