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
  snapshotVersion,
  type StoredSnapshot,
} from './snapshotStore';

const REGISTRY_BASE = 'https://registry.modelcontextprotocol.io/v0/servers';
const SNAPSHOT_PATH = path.join(process.cwd(), 'data', 'snapshot.json');

// Slug: name "vendor.domain/sub" -> "vendor-domain-sub"
// Lossy: case, `_`, and `/`/`.` separators can collapse distinct names onto one
// base slug. Callers that index by slug MUST run disambiguateSlugs() (or
// loadServers) so colliding subjects never share a public identity.
/**
 * Join a disambiguation hash onto a slug with a DOUBLE hyphen.
 *
 * `--` is not cosmetic, it is what makes the slug space injective. `slugify` ends with
 * `.replace(/-+/g, '-')`, so a slug derived from a name can never contain `--` (verified:
 * 0 of 18,732 on the live corpus). A synthesized slug therefore can never equal a bare one.
 *
 * With a SINGLE hyphen it could, and that was a live defect: the hash is `sha256` of a
 * PUBLIC server name, so an attacker precomputes `{base}-{hash}` and registers a name that
 * slugifies to exactly it. Both names then claim one slug, `loadServers`' final `seenSlug`
 * pass silently drops one, and the trust store — which keys by name — writes the attacker's
 * verdict at the slug the site serves for the victim. A wrong-subject verdict is the one
 * failure this product cannot have.
 *
 * Two synthesized slugs `X--h` are equal only when `X` and `h` both match, and `h` is a
 * function of the name, so only for the same name. Injective by construction: no runtime
 * uniqueness check, and no need to ever apply a second suffix.
 *
 * 16 hex, not 12. The hash input is a PUBLIC name and an attacker has unbounded freedom to
 * vary their OWN name within one base slug (case, trailing separators — all collapse), so a
 * 48-bit suffix is a ~2^48 search away from putting two names on one final slug. 64 bits is
 * not. The `srv--` empty-name fallback stays at 12 precisely so the two forms cannot be
 * equal — see `slugify`.
 *
 * mcpindex-trust `corpus_eval/tooling/slug_identity.py` `_suffixed` must match byte for byte.
 */
export const DISAMBIG_HEX = 16;
const EMPTY_NAME_HEX = 12;

export function withDisambiguator(prefix: string, name: string): string {
  return `${prefix}--${createHash('sha256').update(name).digest('hex').slice(0, DISAMBIG_HEX)}`;
}

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
  // `srv--{12 hex}`, NARROWER than the 16-hex disambiguation suffix, and that width
  // difference is load-bearing. This fallback is itself a name-derived slug containing `--`,
  // so it is the one exception to "no name can produce `--`" — colliding with it needed only
  // a 48-bit BIRTHDAY between a name slugifying to `srv` and one slugifying to nothing
  // (~2^24 work, seconds), not a preimage. Different widths make `{base}--{16hex}` and
  // `srv--{12hex}` structurally unable to be equal.
  return `srv--${createHash('sha256').update(name).digest('hex').slice(0, EMPTY_NAME_HEX)}`;
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
      // `baseSlug` deliberately survives untouched: it is the group key the chooser
      // looks up, and rewriting it here would erase the only record of what the bare
      // URL used to address.
      out.push({ ...s, slug: withDisambiguator(base, s.name) });
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
    baseSlug: slugify(s.name),
    name: s.name,
    title: s.title || s.name,
    // TRIMMED. mcpindex-trust's `active_registry_names` does `(description or "").strip()`
    // and drops a whitespace-only row; this side tested truthiness, so '  ' was a
    // description here and not there. That difference changes who is in a collision group,
    // which changes the surviving row's slug on one side only - and the purge then reads
    // the slug this site serves as owned by nobody and deletes its verdict.
    description: (s.description ?? '').trim(),
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
 *  - An admitted row whose base slug already belongs to a registry listing is PRE-HASHED
 *    here, not left bare and not dropped. It must be pre-hashed at this point:
 *    disambiguateSlugs() hashes every member of a colliding GROUP, so a bare admitted row
 *    would drag the registry listing into its group and rename a live /server/<slug> URL.
 *    Pre-hashing puts it in a group of its own and leaves the incumbent alone.
 *
 *    It used to be DROPPED for that reason, and dropping was a silent coverage hole: the
 *    trigger is attacker-controlled (the registry is open-publish, and slugify flattens `.`
 *    and `/` alike, so a lookalike GitHub org is enough), so anyone could remove an admitted
 *    server from the index - and therefore from trust screening - just by publishing.
 *
 *    corpus_eval/tooling/slug_identity.py in mcpindex-trust reimplements BOTH steps and must
 *    stay byte-identical; a divergence keys a verdict at a slug this site never serves.
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
    ? s.repositoryUrl.toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '').replace(/\/+$/, '')
    : '';
  if (repo) {
    if (s.npmPackage) keys.push(`npm:${s.npmPackage.toLowerCase()}@${repo}`);
    if (s.pypiPackage) keys.push(`pypi:${s.pypiPackage.toLowerCase()}@${repo}`);
    if (s.dockerImage) keys.push(`oci:${s.dockerImage.toLowerCase().split(':')[0]}@${repo}`);
  }
  if (s.remoteUrl) keys.push(`remote:${s.remoteUrl.toLowerCase().replace(/\/+$/, '')}`);
  // Fallback for a republication that carries no repository at all (3,439 snapshot entries
  // have none). A bare package key is unsafe in general - identifiers are not unique - but it
  // is safe when the claimant sits in a namespace the registry verifies ownership of, which
  // no attacker can forge.
  if (/^io\.github\.[^/]+\//i.test(s.name)) {
    const ns = s.name.slice(0, s.name.indexOf('/')).toLowerCase();
    if (s.npmPackage) keys.push(`npm:${s.npmPackage.toLowerCase()}@ns:${ns}`);
    if (s.pypiPackage) keys.push(`pypi:${s.pypiPackage.toLowerCase()}@ns:${ns}`);
  }
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
    .flatMap((s): IndexedServer[] => {
      const dupe = identityKeys(s).find((k) => registryIdentities.has(k));
      if (dupe) {
        console.warn('[admitted] dropped, upstream now lists this server under another name', {
          name: s.name,
          matchedOn: dupe,
        });
        return [];
      }
      if (!registryBaseSlugs.has(s.slug)) return [s];
      // slug moves; baseSlug stays at the colliding base, so getCollidingBase still finds
      // this row as a claimant of that URL. Without this the pre-hashed row vanishes from
      // its own collision group and the chooser silently resolves to the registry twin.
      const slug = withDisambiguator(s.slug, s.name);
      console.warn('[admitted] slug collides with a registry listing, disambiguated', {
        name: s.name,
        from: s.slug,
        to: slug,
      });
      return [{ ...s, slug }];
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

// The single source of truth for what this deployment serves. Exported so
// /api/cron/sync-registry can REPORT it (that route is read-only; it cannot change what is
// served). Reads the file every call - no cache - so callers always see what is on disk.
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
// read the ~26MB data/snapshot.json and zod-parse ~19k entries (~200MB transient apiece) ->
// OOM/500s under a traffic spike or parallel crawl. Still worth keeping for that reason alone.
//
// It no longer prevents a body/version MISMATCH, though: that risk existed only while KV could
// move under a live deployment. The bundled snapshot is a build artifact and immutable for the
// life of the deployment, so concurrent resolves cannot disagree. Memory, not correctness.
function resolveSnapshot(): Promise<LoadedSnapshot> {
  if (_resolveInflight) return _resolveInflight;
  _resolveInflight = resolveSnapshotUncached().finally(() => {
    _resolveInflight = null;
  });
  return _resolveInflight;
}

// THE RENDER PATH READS THE BUNDLED SNAPSHOT ONLY. Do not add a network read here.
//
// Any Redis read on this path re-breaks static generation. @upstash/redis DEFAULTS its fetch
// to `cache: "no-store"` (nodejs.mjs: `cache: configOrRequester.cache ?? "no-store"`) and this
// code never overrode it. Every page reaching this function is ISR (`revalidate = 3600`), and
// a no-store fetch during static generation makes Next abort the render with
// `Page changed from static to dynamic at runtime`, which surfaces as a 500.
//
// Note the default is OVERRIDABLE - passing `cache` to the client would silence the bail. That
// is deliberately NOT the fix taken here, because the reasons below stand on their own:
//
//   - it only fired on COLD instances (the _cache short-circuits in loadServers /
//     loadSnapshot / loadSnapshotMeta hide it once warm), which is exactly the path a crawler
//     walking an 18k-URL sitemap hits most, and sustained 5xx costs crawl rate site-wide;
//   - it made an availability SPOF out of a cache, and pulled ~26MB per cold render;
//   - a mutable KV blob could move under a live deployment, so `servers` and `version` could
//     come from different reads and the sitemap could advertise a slug whose page 404s;
//   - freshness cost is ~nil: .github/workflows/sync-registry.yml commits data/snapshot.json
//     every 4h AND redeploys, and KV could only ever hold a copy of an already-deployed bundle.
//
// The KV path is fully deleted (read AND write) as of the follow-up to that fix - see
// lib/snapshotStore.ts. test/routes/snapshot_source.test.ts fails if a network read returns.
async function resolveSnapshotUncached(): Promise<LoadedSnapshot> {
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
      resolved.push({ ...s, slug: withDisambiguator(base, s.name) });
    }
  }
  return resolved.find((s) => s.slug === slug) ?? null;
}

/**
 * The servers that a RETIRED bare slug used to address, when two or more names
 * collide onto it. Returns null for every ordinary slug.
 *
 * WHY THIS EXISTS. `disambiguateSlugs` hashes EVERY member of a colliding set rather
 * than letting first-wins pick a survivor, because a survivor would inherit the other
 * subject's inbound links and, with them, the wrong trust verdict. The cost is that the
 * bare slug stops resolving the moment a collision appears - and it may have been a live,
 * indexed URL until that moment. Measured on the 2026-07-28 corpus: 5 colliding bases
 * over 10 servers out of 18,638, every one a case-variant republication by the same
 * author (`io.github.SceneView/mcp` vs `io.github.sceneview/mcp`). All five bare slugs
 * were returning 404 in production.
 *
 * A redirect is NOT the fix, and that is the whole point. Two subjects claim the slug;
 * picking one is exactly the misattribution disambiguation exists to prevent, and
 * "same author, near-identical name" is an inference, not an observation - the two
 * entries can and do carry different versions, packages, and verdicts. So the bare slug
 * resolves to a page that names both and makes the reader choose. The link stays alive,
 * nothing is asserted about which one they meant.
 */
let _baseIndex: { servers: readonly IndexedServer[]; idx: Map<string, IndexedServer[]> } | null =
  null;

/** `baseSlug -> members`, built once per loaded corpus.
 *
 * Replaces a per-call scan: the previous version ran `slugify()` over ~18,600 names on
 * every 404, twice (generateMetadata and the page), on a route proxy.ts deliberately
 * exempts from the per-IP limiter - so a slug-spray bought ~18ms of CPU per request for
 * free. This is O(n) once against the same cache `loadServers` already keeps.
 *
 * The corpus it was built from is held ALONGSIDE the map, never inside it. A previous
 * version stashed the server list under a `'__n__'` key to detect staleness, which put an
 * 18,739-entry array in the same map `getCollidingBase` looks up with an ATTACKER-SUPPLIED
 * slug: `/server/__n__` answered 200 and rendered a chooser naming every server in the
 * index, unauthenticated, on the one route with no per-IP limit. The cache added to save
 * ~18ms per request became an unbounded render costing orders of magnitude more.
 *
 * Identity comparison, not length: `loadServers` returns the same array for the lifetime of
 * a loaded corpus and a fresh one on reload, so `===` detects a refresh exactly. Comparing
 * lengths could not - two different corpora of equal size read as the same one.
 */
async function baseIndex(): Promise<Map<string, IndexedServer[]>> {
  const servers = await loadServers();
  if (_baseIndex && _baseIndex.servers === servers) return _baseIndex.idx;
  const idx = new Map<string, IndexedServer[]>();
  for (const s of servers) {
    const g = idx.get(s.baseSlug);
    if (g) g.push(s);
    else idx.set(s.baseSlug, [s]);
  }
  _baseIndex = { servers, idx };
  return idx;
}

/**
 * The servers that a bare slug addresses when two or more names collide onto it.
 * Returns null for every ordinary slug.
 *
 * WHY THIS EXISTS. `disambiguateSlugs` hashes EVERY member of a colliding set rather than
 * letting first-wins pick a survivor, because a survivor inherits the other subject's
 * inbound links and, with them, the wrong trust verdict. The cost is that the bare slug
 * stops resolving the moment a collision appears - and it may have been a live, indexed
 * URL until then. All colliding bases were returning 404 in production.
 *
 * A redirect is NOT the fix. Two subjects claim the slug; picking one is exactly the
 * misattribution disambiguation exists to prevent. So the bare slug resolves to a page
 * that names both and makes the reader choose.
 *
 * GROUPS ON `baseSlug`, NOT `slugify(name)`. Those diverge: `mergeAdmitted` PRE-hashes a
 * colliding admitted row, so its `slug` is already `base-<hash>` while its `slugify(name)`
 * is the base. Recomputing from the name missed those rows entirely, which meant a
 * registry listing and an admitted row could claim one URL with the registry row silently
 * owning it - first-wins, reintroduced through the back door.
 *
 * WHEN A LIVE SERVER STILL HOLDS THE BARE SLUG, the chooser does not fire - the caller
 * reaches this only after `getServer` misses. That is correct, not an oversight, and the
 * distinction is worth stating because it looks like the first-wins this design forbids.
 * It is not. A pre-hashed ADMITTED row never held the bare URL: `mergeAdmitted` assigns it
 * a hashed slug at birth precisely so the registry incumbent's live URL does not move. So
 * one subject holds that URL and always has, and no inbound link ever pointed at the other.
 * The chooser exists for the case where the bare slug addressed a server and then STOPPED
 * doing so - two registry names colliding - which is the only case that orphans real links.
 */
export async function getCollidingBase(
  slug: string,
): Promise<IndexedServer[] | null> {
  const members = (await baseIndex()).get(slug);
  if (!members || members.length < 2) return null;
  return members;
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
