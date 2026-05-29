import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type {
  IndexedServer,
  RegistryEntry,
  RegistryResponse,
  Snapshot,
} from './types';
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

export function normalize(entry: RegistryEntry): IndexedServer {
  const s = entry.server;
  const meta = entry._meta['io.modelcontextprotocol.registry/official'];
  const remote = s.remotes?.[0];
  const npmPkg = s.packages?.find((p) => p.registryType === 'npm');
  const pypiPkg = s.packages?.find((p) => p.registryType === 'pypi');
  const dockerPkg = s.packages?.find(
    (p) => p.registryType === 'docker' || p.registryType === 'oci',
  );
  const primary = remote ?? s.packages?.[0];
  return {
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

type LoadedSnapshot = {
  snapshot: Snapshot;
  version: string;
  writtenAt: string;
};

let _cache: { servers: IndexedServer[]; loaded: LoadedSnapshot } | null = null;

async function readBundledSnapshot(): Promise<StoredSnapshot> {
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

async function resolveSnapshot(): Promise<LoadedSnapshot> {
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
  const servers = loaded.snapshot.servers
    .filter(
      (e) =>
        e._meta['io.modelcontextprotocol.registry/official'].status ===
        'active',
    )
    .map(normalize)
    .filter((s) => s.description && s.name && s.slug);
  _cache = { servers, loaded };
  return servers;
}

export async function getServer(slug: string): Promise<IndexedServer | null> {
  const servers = await loadServers();
  return servers.find((s) => s.slug === slug) ?? null;
}

export async function getServerCount(): Promise<number> {
  return (await loadServers()).length;
}

export async function getCategoryCount(): Promise<number> {
  const servers = await loadServers();
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
