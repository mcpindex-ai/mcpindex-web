import 'server-only';
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
 *
 * ---------------------------------------------------------------------------
 * 2026-08-06: THIS ARTIFACT NOW WITHHOLDS RANKING CREDIT. Read this before
 * relying on the paragraph above.
 *
 * lib/quality.ts consults this file and withholds the two repository-derived
 * credits (completeness, documentation) from a flagged listing. In ABSOLUTE
 * terms that still honours "nothing here may raise a score" — no listing
 * scores higher than it did before, every change is a withholding.
 *
 * In RELATIVE terms it does not, and pretending otherwise would make this
 * comment false. The score is consumed as a RANKING (/leaderboard, /best,
 * rankServers -> /api/v1/preflight, the MCP search tool), and in a ranking,
 * lowering some listings is arithmetically identical to raising the rest.
 * Two consequences are knowingly accepted:
 *
 *   1. ABSENCE OF A FLAG IS NOT "CHECKED AND REACHABLE". 16,161 active
 *      listings declare a repository; the census checked 13,105 repos and
 *      was egress-blocked on 176 more. So an unflagged listing may simply
 *      never have been looked at, and it now ranks above a flagged one on
 *      no evidence at all. Absence remains unpublishable as a positive
 *      claim — it must never be rendered or serialized as "reachable".
 *
 *   2. THE DECOY GRADIENT THE PARAGRAPH ABOVE WARNS ABOUT NOW EXISTS. An
 *      attacker keeping a benign repo alive earns 10 points relative to one
 *      who lets it 404, where previously both scored the same. Accepted
 *      because the alternative is worse: 1,915 listings with a corroborated
 *      dead source were being paid full credit, which is a measured defect
 *      rather than a hypothesised one. The score is a maturity heuristic and
 *      was never load-bearing against an adversary — the screen verdict is.
 *
 * The VERDICT remains entirely untouched by liveness. That was always the
 * load-bearing half of the Phase A promise, and it still holds.
 * Logged: tasks/decisions.md 2026-08-06.
 * ---------------------------------------------------------------------------
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
  // DERIVED from reposUnreachable / reposTotal. They live here because they were being
  // hand-maintained inside the very sentences the raw figures are enforced in, so a v2
  // census would have shipped "2,400 of 13,500 (14.0%)" - self-contradicting in one clause.
  pctUnreachable: '14.0%',
  ratioPhrase: 'one in seven',
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

// The PROMISE is memoized, not its value. Caching the value left an await between the
// check and the assignment, so N concurrent cold requests each read and coerced the
// ~2k-entry file. That was tolerable at 2 call sites; it is now load-bearing for scores
// across 8.
let cached: Promise<SourceLivenessDoc> | null = null;

/**
 * How stale the census may get before the whole artifact stops being publishable.
 *
 * The sweep runs weekly, so 60 days is eight-plus consecutive misses — not a late run,
 * a dead pipeline (it is a launchd cron on one box, i.e. a single point of failure).
 *
 * Why the whole artifact and not just the scoring: a flagged entry is a PUBLIC NEGATIVE
 * CLAIM about a third party's repository. The claim carries a burden, and the burden is
 * that we are still checking. If we have stopped checking, we stop claiming - both the
 * rendered banner and the withheld credit. Failing toward silence is the only direction
 * that cannot defame someone whose repository came back online months ago.
 *
 * A stale read is therefore indistinguishable from an absent one downstream, which is
 * correct: absence was never "verified healthy" either.
 */
export const MAX_CENSUS_AGE_DAYS = 60;

export function censusAgeDays(generatedAt: string, now = Date.now()): number | null {
  const t = Date.parse(generatedAt);
  if (Number.isNaN(t)) return null; // unparseable => treat as unusable, not as fresh
  return (now - t) / (1000 * 60 * 60 * 24);
}

export function isCensusPublishable(doc: SourceLivenessDoc, now = Date.now()): boolean {
  const age = censusAgeDays(doc.generated_at, now);
  return age !== null && age <= MAX_CENSUS_AGE_DAYS;
}

export async function loadSourceLiveness(): Promise<SourceLivenessDoc> {
  if (!cached) {
    cached = (async () => {
      const file = path.join(process.cwd(), 'data', 'source-liveness.json');
      const doc = coerceSourceLiveness(JSON.parse(await fs.readFile(file, 'utf8')));
      if (!isCensusPublishable(doc)) {
        // Loud on purpose. Silent staleness is the failure mode this guard exists for:
        // the read still succeeds, so nothing else in the system notices.
        console.error(
          '[source-liveness] census is stale or undated; withholding the whole artifact ' +
            JSON.stringify({
              generated_at: doc.generated_at,
              age_days: censusAgeDays(doc.generated_at),
              max_age_days: MAX_CENSUS_AGE_DAYS,
              entries_withheld: Object.keys(doc.servers).length,
            }),
        );
        return EMPTY;
      }
      return doc;
    })().catch(() => {
      // A failed read must not be memoized. This path fails OPEN - nothing is docked and
      // no test notices - so a transient failure permanently poisoning the isolate would
      // silently restore the exact defect this artifact exists to correct. Absent
      // artifact => nothing published, never an error page, but retried next request.
      cached = null;
      return EMPTY;
    });
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
 * One bulk load, then a synchronous lookup — for the surfaces that score or rank a whole
 * corpus (rankByQuality, the API projections). Awaiting getSourceLiveness() per row would
 * be 20k awaits on the leaderboard for a file already resident in module scope.
 *
 * Returns a closure rather than the doc so callers cannot accidentally read
 * `doc.servers[slug]` — the artifact is keyed by registry NAME, not slug, and that
 * mistake fails open (every lookup misses, nothing is ever docked, no test notices).
 */
export async function livenessLookup(): Promise<
  (s: { name: string }) => SourceLiveness | null
> {
  const doc = await loadSourceLiveness();
  return (s) => doc.servers[s.name] ?? null;
}

/**
 * The published `sourceLiveness` object, for every JSON surface that carries it.
 *
 * Extracted because it existed as two byte-identical literals in lib/projection.ts and
 * app/api/v1/server/[slug]/route.ts under a comment asserting they "cannot drift" - which
 * nothing enforced. The `hasPackage` predicate below was itself wrong in one of those
 * copies until recently, which is the proof that this expression does get edited.
 *
 * `hasPackage`, NOT "has any install target": buildInstalls() counts the remote endpoint
 * as a target, and a remote server's repository was never the executing artifact.
 */
export function sourceLivenessField(
  s: { hasPackage: boolean },
  liveness: SourceLiveness | null,
): { sourceLiveness: SourceLiveness & { recommendation: string } } | Record<string, never> {
  if (!liveness) return {};
  return {
    sourceLiveness: {
      ...liveness,
      recommendation: livenessRecommendation(s.hasPackage),
    },
  };
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
