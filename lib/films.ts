/**
 * The two films as data, loaded from the beat manifest the promo repo generates.
 *
 * `data/video-beats.json` is produced by `seo/extract-beats.mjs` in mcpindex-promo-video,
 * which parses SCRIPT-v4.md - the script is the single source of truth for beat timings.
 * That matters because `Clip` offsets in the JSON-LD MUST match the cut: a key-moment
 * result that jumps to silence is worse than no key moments at all. Re-cut the film,
 * re-run the extractor, copy the json - nothing here needs editing.
 */
import beats from '@/data/video-beats.json';
import type { Film } from '@/lib/video';

/** The manifest is keyed by film id (`concept`, `howto`). */
const MANIFEST = beats as unknown as Record<string, Film>;

/**
 * UPLOAD DATE, not "today". Google treats a moving uploadDate as a signal the content
 * changed; these films are fixed artefacts, and their figures are stated "as of" a date
 * INSIDE the cut. Bump this only when a film is genuinely re-rendered with new content.
 */
export const FILM_UPLOAD_DATE = '2026-08-07';

/** Poster paths. These must match the FIRST FRAME closely or Google is entitled to
 * ignore the thumbnail as a mismatch. Regenerated from the v5 renders 2026-08-07. */
const THUMBNAILS: Record<string, string> = {
  concept: '/promo/poster.jpg',
  howto: '/promo/poster-demo.jpg',
};

export const FILM_IDS = ['concept', 'howto'] as const;
export type FilmId = (typeof FILM_IDS)[number];

export function getFilm(id: string): Film | null {
  return MANIFEST[id] ?? null;
}

export function thumbnailFor(id: string): string {
  const t = THUMBNAILS[id];
  if (!t) throw new Error(`films: no thumbnail for "${id}"`);
  return t;
}

export function allFilms(): ReadonlyArray<{ id: FilmId; film: Film }> {
  return FILM_IDS.map((id) => {
    const film = MANIFEST[id];
    if (!film) throw new Error(`films: manifest is missing "${id}"`);
    return { id, film };
  });
}
