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
 *
 * FULL ISO 8601 WITH TIMEZONE. A bare "2026-08-07" is rejected by Google's Rich Results
 * Test - "Invalid datetime value" plus "missing a timezone" - and `videoObject()` used to
 * validate FOR the bare form, so the check guaranteed the shape the consumer refuses.
 * -07:00 is Pacific, where the films were cut and published; midnight is honest at the
 * day granularity we actually know.
 */
export const FILM_UPLOAD_DATE = '2026-08-07T00:00:00-07:00';

/** Poster paths. These must match the FIRST FRAME closely or Google is entitled to
 * ignore the thumbnail as a mismatch. Regenerated from the v5 renders 2026-08-07. */
const THUMBNAILS: Record<string, string> = {
  concept: '/promo/poster.jpg',
  howto: '/promo/poster-demo.jpg',
};

/**
 * Alt text, deliberately kept NEXT TO the poster paths so re-rendering a poster puts the
 * description under the same edit. These are designed frames carrying real copy, so the alt
 * describes what the frame SAYS - "video thumbnail" would tell a screen-reader user nothing
 * that the surrounding link text does not already say.
 */
const POSTER_ALT: Record<string, string> = {
  concept:
    'Film poster reading "205 tools declared read-only", above a verdict card showing an ' +
    'annotation flip of readOnlyHint from true to false, marked INCONCLUSIVE.',
  howto:
    'Film poster reading "The gate is two commands", above the two install commands: ' +
    'uv tool install mcpindex-gate, then mcpindex-config-wire.',
};

export function posterAltFor(id: string): string {
  const a = POSTER_ALT[id];
  if (!a) throw new Error(`films: no poster alt for "${id}"`);
  return a;
}

/**
 * The YouTube upload of each film, for `sameAs` in the VideoObject.
 *
 * WHY: a self-hosted mp4 rarely ranks in video search on its own. `sameAs` tells a search
 * engine these two URLs are the SAME work rather than duplicates competing with each other,
 * so the YouTube view count and engagement can inform how the /watch page is treated
 * instead of splitting the signal.
 *
 * WHY NOT embedUrl: that stays our own /embed/<slug>. `sameAs` says "this also exists
 * there"; embedUrl says "this is where the player lives", and we serve our own player with
 * no third-party tracking on a product whose pitch is that it egresses nothing.
 *
 * VERIFIED BY TITLE, not by the order they were handed to me - the two IDs arrived in the
 * opposite order to the film list, and wiring them by position would have pointed each
 * film's structured data at the other film.
 */
const YOUTUBE: Record<string, string> = {
  concept: 'https://www.youtube.com/watch?v=gSNz7rRiS3A',
  howto: 'https://www.youtube.com/watch?v=swJoYMLOtt4',
};

export function youtubeFor(id: string): string | null {
  return YOUTUBE[id] ?? null;
}

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
