// MCP Quality Score (v0). Composite 0-100 from publicly observable signals.
// Methodology page (/methodology) is the canonical doc — keep this in sync.
// Intentionally simple. Open PR welcome to refine weights or add signals.

import type { IndexedServer } from './types';

export type QualityBreakdown = {
  freshness: number;       // 0-25 — recently updated
  completeness: number;    // 0-25 — title/desc/repo/website populated
  installability: number;  // 0-25 — has install path (package or remote URL)
  documentation: number;   // 0-15 — env vars described, repo present
  stability: number;       // 0-10 — semver >= 1.0.0
};

export function computeQuality(s: IndexedServer): { score: number; breakdown: QualityBreakdown } {
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

  // Completeness: 5 each for title, description >50 chars, repo, website, icon.
  let completeness = 0;
  if (s.title && s.title !== s.name) completeness += 5;
  if (s.description && s.description.length >= 50) completeness += 5;
  if (s.repositoryUrl) completeness += 5;
  if (s.websiteUrl) completeness += 5;
  if (s.iconUrl) completeness += 5;

  // Installability: 25 if has any install path (package or remote URL).
  const installability = s.hasPackage || s.hasRemote ? 25 : 0;

  // Documentation: 5 if has repo, +10 if env vars are documented when present.
  let documentation = s.repositoryUrl ? 5 : 0;
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

export function rankByQuality(servers: IndexedServer[]): Array<{
  server: IndexedServer;
  score: number;
  breakdown: QualityBreakdown;
}> {
  return servers
    .map((s) => ({ server: s, ...computeQuality(s) }))
    .sort((a, b) => b.score - a.score);
}
