/**
 * Registry churn hygiene for /server/<slug>.
 *
 * Active listings leave the corpus (deleted upstream, or renamed). Google keeps
 * crawling the old URL from historical index/sitemap memory. We persist:
 *   - redirects: old slug → current slug (308)
 *   - gone: permanently removed (410)
 *
 * Seeded from GSC hard-404s; sync-registry.mjs appends new gone entries when an
 * active slug disappears between snapshots. Alias heuristics cover common
 * renames (trailing -mcp drop) without waiting for a seed.
 */

import removals from '@/data/server-removals.json';

export type ServerRemovalsFile = {
  updatedAt: string;
  redirects: Record<string, string>;
  gone: Record<string, { removedAt: string }>;
};

/** Public server slug shape — rejects path traversal / empty / oversized dests. */
export const SERVER_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/;

const data = removals as ServerRemovalsFile;

function safeSlug(slug: string): string | null {
  return SERVER_SLUG_RE.test(slug) ? slug : null;
}

export function getSeededRedirect(slug: string): string | null {
  if (!safeSlug(slug)) return null;
  const dest = data.redirects[slug];
  if (!dest || dest === slug) return null;
  return safeSlug(dest);
}

export function isGoneSlug(slug: string): boolean {
  if (!safeSlug(slug)) return false;
  return Object.hasOwn(data.gone, slug);
}

/**
 * Resolve a missing slug to a live successor when the mapping is unambiguous.
 * Never invents a subject: only seeded redirects, or a single clear alias hit
 * against the provided active slug set.
 */
export function resolveServerRedirect(
  slug: string,
  activeSlugs: ReadonlySet<string>,
  legacySlugs?: ReadonlyMap<string, string>,
): string | null {
  if (!safeSlug(slug) || activeSlugs.has(slug)) return null;

  const seeded = getSeededRedirect(slug);
  if (seeded && activeSlugs.has(seeded)) return seeded;

  // LEGACY DISAMBIGUATION SUFFIX. The separator changed from `-` to `--` to make the slug
  // space injective (registry.ts withDisambiguator), which moved every slug carrying a
  // disambiguation hash.
  //
  // Driven by an EXACT map from `legacySlugRedirects`, never by matching the shape
  // `{x}-{12hex}`. That shape is also a perfectly ordinary bare slug, so a pattern rule
  // could not tell a former slug from a live server's real one and would 308 a dead URL onto
  // an unrelated subject — permanently, and carrying its canonical link equity. Absent the
  // map the rule simply does not fire, which is the right failure.
  const moved = legacySlugs?.get(slug);
  if (moved && activeSlugs.has(moved) && safeSlug(moved)) return moved;

  // Common rename: drop a trailing "-mcp" when that exact active slug exists.
  if (slug.endsWith('-mcp')) {
    const stripped = slug.slice(0, -4);
    if (stripped && activeSlugs.has(stripped) && safeSlug(stripped)) return stripped;
  }

  // Prefix rename: exactly one active slug is `${slug}-…` (e.g. product renamed
  // with a longer path segment). Ambiguous sets must not redirect.
  const prefix = `${slug}-`;
  let only: string | null = null;
  for (const s of activeSlugs) {
    if (!s.startsWith(prefix)) continue;
    if (only !== null) return null; // ambiguous
    only = s;
  }
  return only && safeSlug(only) ? only : null;
}

/** HTML body for proxy-level 410 responses (no React tree). */
export function goneHtml(slug: string): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '').slice(0, 200) || 'unknown';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex,nofollow"/><title>Gone · mcpindex.ai</title></head><body><p>This MCP listing (<code>${safe}</code>) was removed from the official registry and is no longer on mcpindex.ai.</p><p><a href="/servers">Browse servers</a> · <a href="/">Home</a></p></body></html>`;
}
