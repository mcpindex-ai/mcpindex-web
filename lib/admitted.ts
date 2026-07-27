import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AdmittedDoc } from './types';

// Overlay of servers mcpindex indexes even though they are absent from
// registry.modelcontextprotocol.io.
//
// Why a separate file rather than rows in data/snapshot.json: scripts/sync-registry.mjs
// rewrites that snapshot WHOLESALE every 4h and commits it (line ~279), so any hand-added
// entry there is silently reverted within one sync cycle. The overlay is merged at load
// time instead, which also keeps the provenance boundary intact - the snapshot stays a
// faithful mirror of upstream and nothing else.
//
// Admission is editorial, on purpose. There is no submission endpoint: an open intake on a
// trust site is an adverse-selection magnet and turns "listed" into something you get by
// asking rather than something observed. Adding a server here is a deliberate act with a
// published reason.

const ADMITTED_PATH = path.join(process.cwd(), 'data', 'admitted.json');

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

// Structural, matching lib/snapshotSchema.ts: validate only the fields we depend on so
// extra keys pass through instead of failing the whole load.
const PackageZ = z
  .object({
    registryType: z.string(),
    identifier: z.string(),
    version: z.string().optional(),
    transport: z.object({ type: z.string() }).loose().optional(),
  })
  .loose();

const AdmittedEntryZ = z
  .object({
    server: z
      .object({
        name: z.string().min(1),
        description: z.string().min(1),
        title: z.string().optional(),
        version: z.string().min(1),
        repository: z.object({ url: z.string().optional() }).loose().optional(),
        websiteUrl: z.string().optional(),
        packages: z.array(PackageZ).optional(),
        remotes: z.array(z.object({ type: z.string(), url: z.string() }).loose()).optional(),
      })
      .loose(),
    admitted: z
      .object({
        reason: z.string().min(1),
        admittedAt: z.string().min(1),
        // ISO-8601 required, not just non-empty: updatedAt drives the published quality
        // score's freshness dimension and is emitted by the public API, so a loose string
        // here is how an invented date becomes a fabricated fact.
        publishedAt: z.string().regex(ISO_INSTANT, 'must be an ISO-8601 instant'),
        updatedAt: z.string().regex(ISO_INSTANT, 'must be an ISO-8601 instant'),
        datesVerifiedFrom: z.string().min(1).optional(),
      })
      .loose(),
  })
  .loose();

const AdmittedDocZ = z.object({ servers: z.array(AdmittedEntryZ) }).loose();

const EMPTY: AdmittedDoc = { servers: [] };

/**
 * Validate untrusted overlay JSON. A malformed file yields an EMPTY overlay rather than
 * throwing: a bad hand-edit here must never take the whole index down, and the failure
 * mode we want is "the reference servers are missing again", not "the site 500s".
 */
export function coerceAdmitted(raw: unknown): AdmittedDoc {
  // PER-ROW, not all-or-nothing. This used to return EMPTY on any single bad row, so one
  // mistyped date removed every admitted server from the site (pages 404, sitemap shrinks)
  // while the Python screener - which validates per row - kept screening them and computed a
  // DIFFERENT collision set from a different population. Divergent overlays between the two
  // is the failure `active_registry_names` exists to prevent, and an all-or-nothing parser on
  // one side guarantees it. Drop the bad row, keep the rest, and say so.
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { servers?: unknown }).servers)) {
    console.error('[admitted] overlay is not { servers: [...] }, ignoring');
    return EMPTY;
  }
  const servers: AdmittedDoc['servers'] = [];
  (raw as { servers: unknown[] }).servers.forEach((row, i) => {
    const parsed = AdmittedEntryZ.safeParse(row);
    if (parsed.success) {
      servers.push(parsed.data as AdmittedDoc['servers'][number]);
      return;
    }
    console.error('[admitted] dropped row', i, {
      name: (row as { server?: { name?: unknown } })?.server?.name,
      issues: parsed.error.issues.slice(0, 3).map((x) => `${x.path.join('.')}: ${x.message}`),
    });
  });
  return { servers };
}

let _cache: AdmittedDoc | null = null;

/** Read + validate the overlay once per process. Absent file = empty overlay. */
export async function loadAdmitted(): Promise<AdmittedDoc> {
  if (_cache) return _cache;
  try {
    const raw = await fs.readFile(ADMITTED_PATH, 'utf8');
    _cache = coerceAdmitted(JSON.parse(raw));
  } catch (err) {
    // A bare `catch {}` swallowed JSON syntax errors with zero output, so a broken overlay
    // looked identical to no overlay. ENOENT is the only expected absence.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      console.error('[admitted] could not read/parse the overlay', { code, err: String(err).slice(0, 200) });
    }
    _cache = EMPTY;
  }
  return _cache;
}
