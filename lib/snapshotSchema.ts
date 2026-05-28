import { z } from 'zod';

// Runtime schema for data/snapshot.json + KV-persisted snapshots.
// Kept structural rather than exhaustive: registry upstream adds fields freely,
// so we validate only the shape we depend on. New optional fields pass through.

const TransportZ = z.object({
  type: z.string(),
});

const EnvVarZ = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    isRequired: z.boolean().optional(),
    isSecret: z.boolean().optional(),
    default: z.string().optional(),
  })
  .loose();

const PackageZ = z
  .object({
    registryType: z.string(),
    identifier: z.string(),
    version: z.string().optional(),
    transport: TransportZ.loose().optional(),
    environmentVariables: z.array(EnvVarZ).optional(),
  })
  .loose();

const RemoteZ = z
  .object({
    type: z.string(),
    url: z.string(),
  })
  .loose();

const ServerZ = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    title: z.string().optional(),
    version: z.string(),
    repository: z.object({ url: z.string().optional(), source: z.string().optional() }).loose().optional(),
    websiteUrl: z.string().optional(),
    icons: z.array(z.object({ src: z.string() }).loose()).optional(),
    packages: z.array(PackageZ).optional(),
    remotes: z.array(RemoteZ).optional(),
  })
  .loose();

const MetaZ = z.object({
  'io.modelcontextprotocol.registry/official': z
    .object({
      status: z.string(),
      statusChangedAt: z.string(),
      publishedAt: z.string(),
      updatedAt: z.string(),
      isLatest: z.boolean(),
    })
    .loose(),
});

const EntryZ = z
  .object({
    server: ServerZ,
    _meta: MetaZ,
  })
  .loose();

export const SnapshotZ = z
  .object({
    fetchedAt: z.string(),
    totalEntries: z.number(),
    servers: z.array(EntryZ),
    snapshot_version: z.string().optional(),
    snapshot_written_at: z.string().optional(),
  })
  .loose();

export type SnapshotParsed = z.infer<typeof SnapshotZ>;
