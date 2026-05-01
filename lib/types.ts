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
  version: string;
  transport: Transport;
  environmentVariables?: EnvVar[];
  runtimeArguments?: Array<{ name?: string; value?: string; description?: string }>;
};

export type Remote = { type: 'streamable-http' | 'sse'; url: string };

export type RegistryServer = {
  $schema?: string;
  name: string;
  description: string;
  title?: string;
  version: string;
  repository?: { url: string; source: string };
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
export type IndexedServer = {
  slug: string;
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
