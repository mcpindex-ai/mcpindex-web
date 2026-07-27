import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Source liveness (Phase A): whether a server's upstream repository is
 * still publicly accessible.
 *
 * This is NEGATIVE-ONLY evidence. A present entry means two independent
 * vantages agreed the source could not be reached; an ABSENT entry means
 * nothing publishable — never "verified healthy". Nothing here may raise
 * a score, because a reachable repo proves only that a URL resolves (an
 * attacker keeps a benign decoy repo alive for free).
 *
 * The artifact is produced weekly by the VM sweep and committed, matching
 * the verdicts.json pattern: server pages are statically prerendered, so
 * a runtime lookup would add a failure mode to every render.
 */

/**
 * Published figures for the 2026-07-20 census, quoted by /research/source-liveness
 * and by the Zenodo deposition (DOI 10.5281/zenodo.21501868).
 *
 * These are the POST-DEBOUNCE counts: a URL is confirmed unreachable only after two
 * failed checks at least 48h apart plus a second independent vantage. The page once
 * published the raw pre-debounce sweep (1,834 / 2,073 / 306 / 178) and so contradicted
 * the DOI it cited, for four days, because the numbers were hand-copied with only a
 * comment asserting they matched.
 *
 * `reposUnreachable` and `serversAffected` are now enforced against
 * data/source-liveness.json by lib/sourceLiveness.test.ts. The remaining figures come
 * from aggregates.json, which lives in the deposition repo and not here, so they stay
 * comment-guarded: if you edit them, diff against that file first.
 */
export const SOURCE_LIVENESS_CENSUS = {
  serversTotal: '17,673',
  reposTotal: '13,105',
  reposUnreachable: '1,830',
  serversAffected: '2,069',
  sitesUnreachable: '304',
  sampleSize: '150',
  egressBlocked: '176',
  sweepDate: '2026-07-20',
} as const;

export type SourceLivenessState = 'unavailable';

export interface SourceLiveness {
  readonly state: SourceLivenessState;
  readonly url: string;
  /** ISO date (YYYY-MM-DD) we last saw the source reachable. */
  readonly last_verified_accessible: string | null;
  /** ISO date the second vantage confirmed it unreachable. */
  readonly confirmed_unavailable: string | null;
  readonly evidence: {
    readonly http_status: number;
    readonly vantages: number;
    readonly methods: readonly string[];
  };
}

export interface SourceLivenessDoc {
  readonly generated_at: string;
  readonly servers: Readonly<Record<string, SourceLiveness>>;
}

const EMPTY: SourceLivenessDoc = { generated_at: '', servers: {} };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Coerce untrusted JSON into the closed shape. Anything malformed drops
 * the entry rather than rendering a half-built accusation about someone
 * else's project.
 */
export function coerceSourceLiveness(raw: unknown): SourceLivenessDoc {
  if (!isRecord(raw) || !isRecord(raw.servers)) return EMPTY;
  const out: Record<string, SourceLiveness> = {};
  for (const [name, v] of Object.entries(raw.servers)) {
    if (!isRecord(v)) continue;
    if (v.state !== 'unavailable') continue; // closed vocabulary
    const url = str(v.url);
    if (!url || !url.startsWith('https://')) continue;
    const ev = isRecord(v.evidence) ? v.evidence : {};
    const status = typeof ev.http_status === 'number' ? ev.http_status : 0;
    const vantages = typeof ev.vantages === 'number' ? ev.vantages : 0;
    // Publication requires two agreeing vantages; a single-vantage row is
    // not renderable no matter what the file says.
    if (vantages < 2) continue;
    out[name] = {
      state: 'unavailable',
      url,
      last_verified_accessible: str(v.last_verified_accessible),
      confirmed_unavailable: str(v.confirmed_unavailable),
      evidence: {
        http_status: status,
        vantages,
        methods: Array.isArray(ev.methods)
          ? ev.methods.filter((m): m is string => typeof m === 'string')
          : [],
      },
    };
  }
  return { generated_at: str(raw.generated_at) ?? '', servers: out };
}

let cached: SourceLivenessDoc | null = null;

export async function loadSourceLiveness(): Promise<SourceLivenessDoc> {
  if (cached) return cached;
  try {
    const file = path.join(process.cwd(), 'data', 'source-liveness.json');
    cached = coerceSourceLiveness(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch {
    cached = EMPTY; // absent artifact => nothing published, never an error page
  }
  return cached;
}

export async function getSourceLiveness(
  serverName: string,
): Promise<SourceLiveness | null> {
  const doc = await loadSourceLiveness();
  return doc.servers[serverName] ?? null;
}

/**
 * The human-facing sentence. Kept in one place so the wording can be
 * asserted by tests: we publish the OBSERVATION (a 404 from two
 * vantages), never the INFERENCE ("deleted", "gone", "abandoned") — a
 * GitHub 404 cannot distinguish a deleted repo from a deliberately
 * private one, and this line is a public statement about someone's work.
 */
export function livenessSentence(l: SourceLiveness): string {
  const seen = l.last_verified_accessible
    ? `, last verified accessible ${l.last_verified_accessible}`
    : '';
  return (
    `Source repository no longer publicly accessible ` +
    `(HTTP ${l.evidence.http_status}${seen}). ` +
    `This may be deliberate: repositories are sometimes made private or relocated.`
  );
}

/**
 * Machine-actionable hint. Keyed on distribution type because the same
 * fact means different things: for a locally installed package a vanished
 * repo is a real audit gap (you can no longer diff what you run), while a
 * remote server's repo was never the executing artifact.
 */
export function livenessRecommendation(hasLocalInstall: boolean): string {
  return hasLocalInstall
    ? 'source_no_longer_auditable_pin_version_and_review'
    : 'informational_only_remote_endpoint_is_the_artifact';
}
