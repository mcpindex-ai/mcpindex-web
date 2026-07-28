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
): string | null {
  if (!safeSlug(slug) || activeSlugs.has(slug)) return null;

  const seeded = getSeededRedirect(slug);
  if (seeded && activeSlugs.has(seeded)) return seeded;

  // LEGACY DISAMBIGUATION SUFFIX. The separator changed from `-` to `--` to make the slug
  // space injective (registry.ts withDisambiguator), which moved every slug carrying a
  // disambiguation hash. `${base}--${hash}` is only ever produced from a name whose base is
  // `base` and whose hash is `hash`, so if that slug is live, `${base}-${hash}` was the same
  // server's previous URL and this is a rename, not a guess.
  const legacy = /^(.+)-([0-9a-f]{12})$/.exec(slug);
  if (legacy) {
    const moved = `${legacy[1]}--${legacy[2]}`;
    if (activeSlugs.has(moved) && safeSlug(moved)) return moved;
  }

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
