// MCP Quality Score (v0). Composite 0-100 from publicly observable signals.
// Methodology page (/methodology) is the canonical doc - keep this in sync.
// Intentionally simple. Open PR welcome to refine weights or add signals.

import type { IndexedServer } from './types';
// TYPE-ONLY, and it must stay that way: ./sourceLiveness declares `import 'server-only'`
// and reads from disk. A value import would drag both into any CLIENT bundle that imports
// the scorer, and would make this module unimportable without --conditions=react-server.
// (It would NOT break the test runner - that condition is set - so do not reach for that
// as the justification.) `import type` is erased at compile time.
import type { SourceLiveness } from './sourceLiveness';

/**
 * THE FLIP. Set to `true` after the 2026-08-20 SEO checkpoint reading is taken.
 *
 * Everything else in this change - the plumbing, the published `sourceLiveness` field on
 * every list surface, the MCP tool caveat, the JSON-LD correction - ships now, because it
 * fixes the actual harm: an agent reading `QS 90/100` for a listing whose source this site
 * has already published as unreachable. None of that moves a score.
 *
 * The docking does. It moves 1,915 of 20,102 listings by -10, reorders /api/v1/servers
 * (the feed external aggregators pull), and churns 130 pages in and out of the
 * prerendered top-1500. Shipping that into an open measurement window would make the
 * checkpoint unattributable - the same reason the flagged-set hub page was deferred, and
 * it would be inconsistent to defer one and wave the other through.
 *
 * Gated rather than reverted so the reasoning, the tests and the guard survive the wait.
 * Flipping this is a one-line change; lib/quality.test.ts asserts both sides.
 */
export const DOCK_UNREACHABLE_SOURCE = false;

export type QualityBreakdown = {
  freshness: number;       // 0-25 - recently updated
  completeness: number;    // 0-25 - title/desc/repo/website populated
  installability: number;  // 0-25 - has install path (package or remote URL)
  documentation: number;   // 0-15 - env vars described, repo present
  stability: number;       // 0-10 - semver >= 1.0.0
};

/**
 * `liveness` is REQUIRED, not optional, so tsc enumerates every call site and none can
 * score a server without deciding what it knows about the source. Same reasoning
 * lib/types.ts gives for making ServerSource required.
 *
 * Semantics are the file's, not ours to reinterpret: NEGATIVE-ONLY evidence. A non-null
 * value means two vantages agreed the source could not be reached. `null` means nothing
 * publishable - it is NOT "verified healthy", which is why it can only ever withhold
 * credit here and never add any.
 *
 * Presence of the entry is the signal, deliberately not a URL match against
 * `s.repositoryUrl`. The server page's banner already keys off presence alone, and a
 * string comparison would silently stop docking on a trailing slash or a `.git` suffix -
 * failing open on exactly the listings this exists to catch.
 */
export function computeQuality(
  s: IndexedServer,
  liveness: SourceLiveness | null,
): { score: number; breakdown: QualityBreakdown } {
  const now = Date.now();
  const updated = new Date(s.updatedAt).getTime();
  const daysSinceUpdate = Math.max(0, (now - updated) / (1000 * 60 * 60 * 24));

  // Freshness: 25 if updated <30d, decays linearly to 0 by 365d.
  const freshness =
    daysSinceUpdate < 30
      ? 25
      : daysSinceUpdate >= 365
        ? 0
        : Math.round(25 * (1 - (daysSinceUpdate - 30) / 335));

  // Both repo-derived credits below are gated on this, not on the URL merely being a
  // populated string. A repository this site's own census has published as unreachable
  // is not metadata a reader can use: they cannot read the docs there and they cannot
  // audit what they run. Scoring it as present, while the same page renders "source
  // repository no longer publicly accessible" two inches above the number, is one page
  // asserting two contradictory things.
  const repoUsable =
    Boolean(s.repositoryUrl) && (!DOCK_UNREACHABLE_SOURCE || liveness === null);

  // Completeness: 5 each for title, description >50 chars, repo, website, icon.
  let completeness = 0;
  if (s.title && s.title !== s.name) completeness += 5;
  if (s.description && s.description.length >= 50) completeness += 5;
  if (repoUsable) completeness += 5;
  if (s.websiteUrl) completeness += 5;
  if (s.iconUrl) completeness += 5;

  // Installability: 25 if has any install path (package or remote URL).
  //
  // Deliberately NOT gated on liveness. An unreachable repo does not make the server
  // uninstallable: for a remote entry the endpoint was never the repo, which is exactly
  // what livenessRecommendation() already tells callers
  // ('informational_only_remote_endpoint_is_the_artifact'). Docking here would contradict
  // our own published reasoning. Reachability of the install path itself is unmeasured -
  // a separate probe, not something this field may imply.
  const installability = s.hasPackage || s.hasRemote ? 25 : 0;

  // Documentation: 5 if has repo, +10 if env vars are documented when present.
  let documentation = repoUsable ? 5 : 0;
  if (s.envVars.length === 0) {
    documentation += 10; // no required config = arguably "self-documented"
  } else {
    const documented = s.envVars.filter((v) => v.description).length;
    documentation += Math.round((documented / s.envVars.length) * 10);
  }

  // Stability: semver major >= 1 = 10, 0.x = 5, no version = 0.
  const major = parseInt(s.version.split('.')[0] ?? '0', 10);
  const stability = major >= 1 ? 10 : major === 0 ? 5 : 0;

  const breakdown: QualityBreakdown = {
    freshness,
    completeness,
    installability,
    documentation,
    stability,
  };
  const score =
    breakdown.freshness +
    breakdown.completeness +
    breakdown.installability +
    breakdown.documentation +
    breakdown.stability;
  return { score, breakdown };
}

/**
 * `livenessOf` is a lookup, not a doc, so the caller does one bulk load and this stays
 * synchronous and pure. Build it with livenessLookup() from ./sourceLiveness.
 */
export function rankByQuality(
  servers: IndexedServer[],
  livenessOf: (s: IndexedServer) => SourceLiveness | null,
): Array<{
  server: IndexedServer;
  score: number;
  breakdown: QualityBreakdown;
}> {
  return servers
    .map((s) => ({ server: s, ...computeQuality(s, livenessOf(s)) }))
    .sort((a, b) => b.score - a.score);
}
