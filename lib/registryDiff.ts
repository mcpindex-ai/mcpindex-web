import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IndexedServer } from './types';

/**
 * Added / updated classification for /api/v1/diff.
 *
 * The snapshot is fetched with version=latest, so each record's publishedAt is when its LATEST
 * version was published and its updatedAt moves only on a status edit. Splitting on those two
 * alone called every new release of an existing server "added" and left "updated" at zero for
 * window: only the few active records with a status edit ever qualified.
 *
 * What a server's age comes from instead is data/first-seen.json (scripts/first-seen.mjs): the
 * earliest publishedAt any committed snapshot has carried for that name.
 */

export type FirstSeenDoc = {
  schema_version: 1;
  /** Earliest snapshot fetchedAt folded into the doc. */
  observed_from: string;
  servers: Record<string, string>;
};

export type DiffClassification = {
  added: IndexedServer[];
  updated: IndexedServer[];
  /** Extra provenance limit tokens this window needs. */
  limits: string[];
};

function coerceFirstSeen(raw: unknown): FirstSeenDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.schema_version !== 1) return null;
  if (typeof r.observed_from !== 'string' || Number.isNaN(Date.parse(r.observed_from))) return null;
  if (typeof r.servers !== 'object' || r.servers === null) return null;
  return { schema_version: 1, observed_from: r.observed_from, servers: r.servers as Record<string, string> };
}

let cached: Promise<FirstSeenDoc | null> | null = null;

/** The committed artifact, or null when it is missing or malformed. */
export async function loadFirstSeen(): Promise<FirstSeenDoc | null> {
  if (!cached) {
    cached = fs
      .readFile(path.join(process.cwd(), 'data', 'first-seen.json'), 'utf8')
      .then((txt) => coerceFirstSeen(JSON.parse(txt)))
      .catch(() => null)
      .then((doc) => {
        // Loud on purpose: without it /api/v1/diff falls back to counting new versions as added.
        if (!doc) console.error('[registryDiff] data/first-seen.json missing or malformed; diff falls back to latest-version dates');
        return doc;
      });
  }
  return cached;
}

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : Number.NaN);

/**
 * added: the name was first seen at or after `since`.
 * updated: the name was first seen before `since`, and its latest version was published (or its
 * record was updated) at or after `since`.
 * A server in neither list is unchanged in the window.
 *
 * A name missing from the doc (an editorially admitted server, or a sync that has not folded it
 * in yet) uses its own publishedAt, the same reading the endpoint used before the doc existed.
 */
export function classifyDiff(
  servers: readonly IndexedServer[],
  firstSeen: FirstSeenDoc | null,
  since: Date,
): DiffClassification {
  const t = since.getTime();
  const added: IndexedServer[] = [];
  const updated: IndexedServer[] = [];
  for (const s of servers) {
    const pub = ms(s.publishedAt);
    const recorded = ms(firstSeen?.servers[s.name]);
    // min, so a doc that lags a sync never makes a server look younger than its own record.
    const first = Number.isNaN(recorded) ? pub : Math.min(recorded, pub);
    if (first >= t) {
      added.push(s);
    } else if (pub >= t || ms(s.updatedAt) >= t) {
      updated.push(s);
    }
  }
  const limits: string[] = [];
  if (!firstSeen) {
    limits.push('first_seen_unavailable_new_versions_counted_as_added');
  } else if (t < Date.parse(firstSeen.observed_from)) {
    // Names already in the first snapshot carry that snapshot's latest-version date, which can be
    // later than their real first publish. For a window starting before it, some of those can
    // land in `added` when they belong in `updated`.
    limits.push('since_precedes_first_seen_history');
  }
  return { added, updated, limits };
}
