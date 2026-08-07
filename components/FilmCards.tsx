import Link from 'next/link';
import { allFilms, thumbnailFor, posterAltFor } from '@/lib/films';
import { pageFor, searchCopy } from '@/lib/video';

/**
 * Poster cards that LINK to each film's page. Deliberately not players.
 *
 * WHY NOT EMBED THE FILM HERE. The two films were just split onto their own /watch pages
 * because two co-equal <video> elements on /demo produced "could not determine the
 * prominent video" in Search Console. Embedding the same mp4 on the homepage would make
 * Google choose between mcpindex.ai and /watch/<slug> as that video's home - recreating
 * the same defect one level up, against the site's highest-authority URL. A link passes
 * authority TO the canonical page instead of competing with it.
 *
 * WHY IT EXISTS AT ALL. The films were moved off the homepage in the 2026-07-12
 * install-first rebuild, which was the right call - the interactive DriftGateDemo above is
 * a better demonstration than a 112-second film, because the visitor drives it. But the
 * homepage then linked to /watch ZERO times, so the two pages carrying the structured data
 * and the transcripts got no equity from the strongest page on the site.
 *
 * WHY POSTERS AND NOT CARD-SIZED DERIVATIVES. These are the same files the /watch and
 * /demo players use as their `poster`. A separate homepage-sized copy would be lighter and
 * would drift: re-cut the film, regenerate the posters, forget the derivatives, and the
 * homepage shows a frame from the old film. One source of truth, and `loading="lazy"` means
 * the weight is only paid by someone who scrolls this far.
 *
 * The card title is `searchCopy().name` - the SAME string as the /watch <h1>, its <title>
 * and the JSON-LD `name`. A card promising something the destination does not say is the
 * same class of defect as a Clip offset pointing at silence.
 */
export function FilmCards() {
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {allFilms().map(({ id, film }) => {
        const copy = searchCopy(id);
        const mins = Math.floor(film.duration / 60);
        const secs = String(film.duration % 60).padStart(2, '0');
        return (
          <Link key={id} href={pageFor(film)} className="group block">
            <div className="rule-t rule-b rule-l rule-r bg-black overflow-hidden">
              {/* Explicit intrinsic size reserves the box before the bytes land, so a lazy
                  image cannot shift the section under a reader mid-scroll.

                  Plain <img>, matching the two other usages in this repo (ScanTool,
                  proseComponents) which disable the same rule. `next/image` is used NOWHERE
                  here, and adopting it for two cards would put every poster through Vercel's
                  billed image optimizer for a benefit the rule is aimed at elsewhere: these
                  are below the fold, lazy, and dimensioned, so they cannot be the LCP element
                  the rule exists to protect. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailFor(id)}
                alt={posterAltFor(id)}
                width={1920}
                height={1080}
                loading="lazy"
                decoding="async"
                className="w-full aspect-video object-cover"
              />
            </div>
            <div className="mt-3 text-[14.5px] leading-[1.45] text-[var(--color-ink)] group-hover:text-[var(--color-accent-strong)]">
              {copy.name}
            </div>
            {/* Says what the destination actually is. The card navigates to a PAGE - framing
                it as a player would be a click promising playback and delivering a route. */}
            <div className="mt-1 font-mono text-[12px] text-[var(--color-mute)] tabular-nums">
              {mins}:{secs} · {film.beats.length} key moments · full transcript
            </div>
          </Link>
        );
      })}
    </div>
  );
}
