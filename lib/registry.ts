import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  IndexedServer,
  RegistryEntry,
  RegistryResponse,
  Snapshot,
} from './types';
import { categorize } from './categorize';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0/servers';
const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'snapshot.json');

// Slug: name "vendor.domain/sub" -> "vendor-domain--sub", reversible-ish.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll('/', '--')
    .replaceAll('.', '-')
    .replaceAll('@', '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
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
        : primary.transport.type
      : null,
    npmPackage: npmPkg?.identifier,
    pypiPackage: pypiPkg?.identifier,
    dockerImage: dockerPkg?.identifier,
    remoteUrl: remote?.url,
    repositoryUrl: s.repository?.url,
    websiteUrl: s.websiteUrl,
    iconUrl: s.icons?.[0]?.src,
    envVars:
      s.packages?.flatMap((p) => p.environmentVariables ?? []) ?? [],
  };
}

let _cache: { servers: IndexedServer[]; raw: Snapshot } | null = null;

export async function loadSnapshot(): Promise<Snapshot> {
  const raw = await fs.readFile(SNAPSHOT_PATH, 'utf8');
  return JSON.parse(raw) as Snapshot;
}

export async function loadServers(): Promise<IndexedServer[]> {
  if (_cache) return _cache.servers;
  const raw = await loadSnapshot();
  const servers = raw.servers
    .filter(
      (e) =>
        e._meta['io.modelcontextprotocol.registry/official'].status ===
        'active',
    )
    .map(normalize)
    .filter((s) => s.description && s.name);
  _cache = { servers, raw };
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
