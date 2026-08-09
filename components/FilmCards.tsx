import Link from 'next/link';
import Image from 'next/image';
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
 * WHY POSTERS AND NOT CARD-SIZED DERIVATIVES. The SOURCE stays the same file the /watch and
 * /demo players use as their `poster` - a hand-committed homepage-sized copy would drift
 * (re-cut the film, regenerate the posters, forget the derivative, and the homepage shows a
 * frame from the old film). `next/image` keeps that single source of truth and derives the
 * card-sized copy from it per request, so there is nothing to forget.
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

                  WHY next/image AND NOT A PLAIN <img> (reversed 2026-08-09). These were plain
                  <img> on the argument that below-the-fold + lazy + dimensioned means they can
                  never be the LCP element, so the optimizer was cost without benefit. That is
                  true of the ELEMENT and false of the METRIC: Lighthouse builds the LCP
                  dependency graph from every request issued before the LCP paint, and Chrome's
                  lazy threshold pulls both posters in well before it, so two 1920x1080 JPEGs
                  displayed in a 634px-wide box sat on the simulated Slow-4G pipe ahead of the
                  hero h1. Measured on identical local prod builds (Lighthouse 12, mobile,
                  simulated): 459.6 KiB of image -> 16.3 KiB, LCP 3.6s -> 3.2s, perf 90 -> 93,
                  and uses-responsive-images / modern-image-formats / uses-optimized-images
                  from 408 / 344 / 136 KiB flagged to passing. The optimizer bill is two source
                  images.

                  `sizes` is computed, not guessed: --site-max-width 1180px, 2.5rem inline
                  padding and gap-8 make each card 534px at full width, so the mobile branch
                  resolves to ~640w and desktop tops out at 1080w. A lazy 100vw default would
                  have re-fetched 1920w and undone the fix. This couples the string to
                  globals.css - change --site-max-width and it silently over-fetches (costs
                  bytes, never correctness). */}
              <Image
                src={thumbnailFor(id)}
                alt={posterAltFor(id)}
                width={1920}
                height={1080}
                sizes="(min-width: 1180px) 534px, (min-width: 640px) calc((100vw - 7rem) / 2), calc(100vw - 3rem)"
                loading="lazy"
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
