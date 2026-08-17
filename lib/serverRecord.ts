// The registry-record prose for the server page. Claim sentences live in lib
// with tests - same reason livenessSentence does: wording rendered on 20k
// public pages must not drift into asserting more than the data holds.
//
// The load-bearing caveat: the snapshot mirrors version=latest records, so
// publishedAt/updatedAt describe the CURRENT VERSION's registry record, not the
// server's lifetime. A server in the registry since 2025 across many releases
// carries only its newest record's dates. Every sentence here is therefore
// scoped to "the current version"; a first-entered-the-registry date does not
// exist in this data and must not be implied.
import type { IndexedServer } from './types';
import { fmtDay } from './dates';
import { CATEGORY_LABELS } from './categorize';

/** Strip one leading "v" so `v${displayVersion(s)}` never renders "vv4.82.0". */
export function displayVersion(version: string): string {
  return version.replace(/^v/i, '');
}

/**
 * One clause per declared distribution surface. Falls back to a nameless
 * "through a declared package" when packages exist but none has a registry
 * type we can name (mcpb, nuget, ...) - asserting "no declared package"
 * there would be false. The remaining absence case is stated outright.
 */
export function describeDistribution(s: IndexedServer): string {
  const parts: string[] = [];
  if (s.npmPackage) parts.push(`as ${s.npmPackage} on npm`);
  if (s.pypiPackage) parts.push(`as ${s.pypiPackage} on PyPI`);
  if (s.dockerImage) parts.push(`as the Docker image ${s.dockerImage}`);
  if (s.hasRemote) {
    parts.push(
      s.primaryTransport
        ? `as a hosted remote over ${s.primaryTransport}`
        : 'as a hosted remote',
    );
  }
  if (parts.length === 0 && s.hasPackage) parts.push('through a declared package');
  return parts.length > 0 ? parts.join(' and ') : 'with no declared package or remote';
}

/**
 * First sentence: the current version's registry (or package-registry) dates.
 * Compares raw instants, not formatted days, so a same-day update is never
 * claimed as "untouched". Omits any clause whose date is missing or invalid
 * rather than rendering "published on ,".
 */
export function recordOpening(s: IndexedServer): string {
  const ver = `v${displayVersion(s.version)}`;
  const pub = fmtDay(s.publishedAt);
  const upd = fmtDay(s.updatedAt);
  if (s.source === 'registry') {
    if (!pub) return `The current version in the official MCP registry is ${ver}.`;
    const touched =
      s.updatedAt !== s.publishedAt && upd
        ? ` Its record was last touched ${upd}.`
        : '';
    return `The current version, ${ver}, was published to the official MCP registry on ${pub}.${touched}`;
  }
  // Admitted listing: dates come from its package registry, and saying so is
  // part of the claim. mergeAdmitted guarantees no official-registry duplicate.
  if (!pub || !upd) {
    return `The current version is ${ver}; the server is not listed in the official MCP registry.`;
  }
  return (
    `The current version, ${ver}, was first published ${pub} and last updated ${upd} ` +
    `per its package registry; the server is not listed in the official MCP registry.`
  );
}

/**
 * Second sentence: distribution, index-side category (attributed to the index,
 * because the category is our heuristic, not registry taxonomy), and the
 * deduplicated env surface (envVars flatMaps per-package declarations, so the
 * same name can repeat across packages).
 */
export function recordDetails(s: IndexedServer): string {
  const label = CATEGORY_LABELS[s.category] ?? s.category;
  const envCount = new Set(s.envVars.map((v) => v.name)).size;
  const env =
    envCount > 0
      ? `, and declares ${envCount === 1 ? 'one environment variable' : `${envCount} environment variables`}`
      : '';
  return `It is distributed ${describeDistribution(s)}, filed under ${label} by this index${env}.`;
}
