// Schema mirrors registry.modelcontextprotocol.io/v0/servers (schema 2025-12-11).
// Fields are conservatively optional because real-world entries skip many.

export type Transport = { type: 'stdio' | 'sse' | 'streamable-http' };

export type EnvVar = {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
};

export type Package = {
  registryType: 'npm' | 'pypi' | 'docker' | 'oci' | 'github' | string;
  identifier: string;
  version?: string;
  transport?: Transport;
  environmentVariables?: EnvVar[];
  runtimeArguments?: Array<{ name?: string; value?: string; description?: string }>;
};

export type Remote = { type: 'streamable-http' | 'sse'; url: string };

export type RegistryServer = {
  $schema?: string;
  name: string;
  description?: string;
  title?: string;
  version: string;
  repository?: { url?: string; source?: string };
  websiteUrl?: string;
  icons?: Array<{ src: string; sizes?: string[] }>;
  packages?: Package[];
  remotes?: Remote[];
};

export type RegistryEntry = {
  server: RegistryServer;
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      status: 'active' | 'deprecated' | 'deleted' | string;
      statusChangedAt: string;
      publishedAt: string;
      updatedAt: string;
      isLatest: boolean;
    };
  };
};

export type RegistryResponse = {
  servers: RegistryEntry[];
  metadata: { nextCursor?: string; count: number };
};

export type Snapshot = {
  fetchedAt: string;
  totalEntries: number;
  servers: RegistryEntry[];
};

// Normalized shape used everywhere on-site.
// Where a listing came from. 'registry' = mirrored from
// registry.modelcontextprotocol.io. 'admitted' = indexed by mcpindex even though it
// is absent upstream (the reference servers are the motivating case: the most-
// installed MCP servers in the ecosystem are in no registry). Required, not
// optional, so tsc finds every construction site and no listing can be rendered
// without its provenance being decided.
export type ServerSource = 'registry' | 'admitted';

// An overlay listing: a registry-shaped server plus why we admitted it. Carries NO
// `io.modelcontextprotocol.registry/official` block - stamping one would make an
// unlisted server claim registry provenance on our own pages, API and JSON-LD.
export type AdmittedEntry = {
  server: RegistryServer;
  admitted: {
    /** Public, human-readable justification. Rendered on the server page. */
    reason: string;
    /** ISO date we admitted it. */
    admittedAt: string;
    /**
     * Real package-registry timestamps, NOT hand-stamped. `updatedAt` feeds the freshness
     * dimension of the published quality score and is emitted by the public API, so an
     * invented value there is a fabricated fact, not a placeholder.
     */
    publishedAt: string;
    updatedAt: string;
    /** Where the two dates above were read from, so the claim is auditable. */
    datesVerifiedFrom?: string;
  };
};

export type AdmittedDoc = {
  servers: AdmittedEntry[];
};

export type IndexedServer = {
  source: ServerSource;
  /** Public admission rationale. Present only when source === 'admitted'. */
  admittedReason?: string;
  slug: string;
  /** Pre-disambiguation slug: what `slugify(name)` produced before any hashing.
   *
   * Carried explicitly because it can no longer be recomputed from `name`. `mergeAdmitted`
   * PRE-hashes a colliding admitted row, so for that row `slugify(name) !== slug` AND the
   * group it belongs to is keyed on neither. Recomputing was the bug: a chooser that groups
   * by `slugify(name)` silently misses those rows. */
  baseSlug: string;
  name: string;
  title: string;
  description: string;
  version: string;
  category: string;
  publishedAt: string;
  updatedAt: string;
  status: string;
  hasRemote: boolean;
  hasPackage: boolean;
  primaryTransport: Transport['type'] | null;
  npmPackage?: string;
  pypiPackage?: string;
  dockerImage?: string;
  remoteUrl?: string;
  repositoryUrl?: string;
  websiteUrl?: string;
  iconUrl?: string;
  envVars: EnvVar[];
};

export type Diff = {
  since: string;
  added: IndexedServer[];
  removed: Array<{ slug: string; name: string }>;
  versionChanged: Array<{ slug: string; name: string; from: string; to: string }>;
};
