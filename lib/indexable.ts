import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { serverFp } from './driftFingerprint';
import { LEDGER_SCHEMA_V3, type ContextEvent, type LedgerEvent } from './ledger';

/**
 * Which /server pages are offered to search engines.
 *
 * WHY THIS EXISTS. On 2026-09-03 Google impressions fell from 666/day to 80 and clicks to zero,
 * with no deploy, no manual action and a clean crawl (99.67% 200s). Indexed pages fell from
 * 21,641 to 13,123 while the corpus grew past 37,000, and Google began refusing guides and
 * compare pages too: a site-level judgment. Every one of the 37,926 verdicts had the same shape
 * (PARTIAL / scanned / REVIEW / one description-level dimension), and the rest of each page was
 * registry text that every directory republishes. The one fact only we hold is crawler-observed
 * drift, so a server page is indexable only when the ledger has an event of its own for it.
 * Spec: GBCode/tasks/mcpindex-seo-recovery-spec-2026-10-02.md.
 *
 * Publisher-wide (fleet) changes do not qualify on their own. A fleet change is one publisher
 * event repeated across its servers, which is the near-duplicate problem again.
 *
 * The set is a committed artifact written by the registry sync, never computed at render time:
 * a ledger miss during an ISR revalidation would flip pages between index and noindex, which is
 * worse for us than either steady state.
 */

export const INDEXABLE_SCHEMA = 'mcpindex.indexable/1';
export const INDEXABLE_CRITERION =
  'registry server with at least one independent tool or context event in the public drift ledger';

export interface IndexableDoc {
  readonly schema: typeof INDEXABLE_SCHEMA;
  readonly generated_at: string;
  readonly ledger_generated_at: string;
  readonly criterion: string;
  readonly servers: readonly string[];
}

/** Below this fraction of the previous count, or above its reciprocal, the new set is refused.
 * Half the drift does not vanish between syncs, and it does not quadruple either. */
export const INDEXABLE_KEEP_RATIO = 0.5;

/** A /3 ledger lists fleet-collapsed tools outside `events`. A /2 blob puts them back in
 * `events`, so every fleet-only server would qualify and the sitemap would re-expand.
 * Only /3 can answer the criterion. Callers keep the last file on anything else. */
export function ledgerAnswersIndexableCriterion(schema: string): boolean {
  return schema === LEDGER_SCHEMA_V3;
}

/** Whether a freshly computed count may replace the previous one. Zero is never written.
 * With no previous count the first file is accepted. */
export function indexableCountAcceptable(next: number, previous: number | null): boolean {
  if (next <= 0) return false;
  if (previous === null || previous <= 0) return true;
  if (next < previous * INDEXABLE_KEEP_RATIO) return false;
  if (next > previous / INDEXABLE_KEEP_RATIO) return false;
  return true;
}

/** Registry names whose drift fingerprint appears in the ledger's own tool or context events.
 * Sorted, so the committed file diffs cleanly between syncs. */
export function computeIndexable(
  names: readonly string[],
  events: readonly Pick<LedgerEvent, 'server_fp'>[],
  contextEvents: readonly Pick<ContextEvent, 'server_fp'>[],
): string[] {
  const fps = new Set<string>([...events.map((e) => e.server_fp), ...contextEvents.map((e) => e.server_fp)]);
  return [...new Set(names)].filter((n) => fps.has(serverFp(n))).sort();
}

/** Untrusted JSON to the closed shape, or null. Null means "no artifact", which callers read as
 * today's behaviour (everything indexable), never as "nothing indexable". */
export function coerceIndexable(raw: unknown): IndexableDoc | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.schema !== INDEXABLE_SCHEMA) return null;
  if (typeof r.generated_at !== 'string' || typeof r.ledger_generated_at !== 'string') return null;
  if (typeof r.criterion !== 'string' || !Array.isArray(r.servers)) return null;
  const servers = r.servers.filter((s): s is string => typeof s === 'string' && s.length > 0);
  if (servers.length === 0) return null;
  return {
    schema: INDEXABLE_SCHEMA,
    generated_at: r.generated_at,
    ledger_generated_at: r.ledger_generated_at,
    criterion: r.criterion,
    servers,
  };
}

let cachedDoc: Promise<IndexableDoc | null> | null = null;
let cached: Promise<ReadonlySet<string> | null> | null = null;

/** The committed artifact, or null when it is missing or malformed. */
export async function loadIndexableDoc(): Promise<IndexableDoc | null> {
  if (!cachedDoc) {
    cachedDoc = fs
      .readFile(path.join(process.cwd(), 'data', 'indexable-servers.json'), 'utf8')
      .then((txt) => coerceIndexable(JSON.parse(txt)))
      .catch(() => null)
      .then((doc) => {
        // Loud on purpose: a null here re-opens every server page to search.
        if (!doc) console.error('[indexable] data/indexable-servers.json missing or malformed; every server page is indexable');
        return doc;
      });
  }
  return cachedDoc;
}

/** The indexable name set, or null when the artifact is missing or malformed. */
export async function loadIndexable(): Promise<ReadonlySet<string> | null> {
  if (!cached) {
    cached = loadIndexableDoc().then((doc) => (doc ? new Set(doc.servers) : null));
  }
  return cached;
}

/** Robots for one server page. Omitted when the page is offered to search, so the layout
 * default (index, follow) stands. Otherwise noindex, follow: the page stays addressable
 * and its links still count. */
export function serverSearchRobots(
  offer: boolean,
): { robots: { index: false; follow: true } } | Record<string, never> {
  return offer ? {} : { robots: { index: false, follow: true } };
}

/** Predicate over registry names. Without an artifact every page stays indexable. */
export async function indexablePredicate(): Promise<(name: string) => boolean> {
  const set = await loadIndexable();
  return set ? (name) => set.has(name) : () => true;
}
