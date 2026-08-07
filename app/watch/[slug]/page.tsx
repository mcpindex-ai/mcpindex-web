import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { jsonLdSafe } from '@/lib/jsonLd';
import { allFilms, getFilm, thumbnailFor, FILM_UPLOAD_DATE } from '@/lib/films';
import { pageFor, videoObject, searchCopy } from '@/lib/video';

/**
 * ONE FILM PER PAGE. This is the fix for "No video indexed: 1" in Search Console.
 *
 * `/demo` carries two co-equal <video> sections, which is the textbook "could not determine
 * the prominent video" case - Google indexes a single prominent video per page. Adding
 * structured data to `/demo` would NOT have fixed that; the split is the fix, and the
 * structured data makes the split legible.
 *
 * Exactly two URLs, deliberately. The logged SEO baseline reads the site's average-position
 * decline as dilution, so every additional URL is a cost, not a free lottery ticket.
 *
 * AEO: an answer engine cannot watch a video. The film is a ranking and engagement surface;
 * the TRANSCRIPT is the citable asset, which is why it renders visibly below the player
 * rather than living only inside the JSON-LD. Same reasoning as the 17 diagrams on this
 * site, each of which ships a plain-text rendering beside its SVG.
 */

export const revalidate = 86400;

const SLUGS = Object.fromEntries(
  allFilms().map(({ id, film }) => [pageFor(film).replace('/watch/', ''), id]),
) as Record<string, string>;

export function generateStaticParams() {
  return Object.keys(SLUGS).map((slug) => ({ slug }));
}

function filmForSlug(slug: string) {
  const id = SLUGS[slug];
  return id ? { id, film: getFilm(id) } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const hit = filmForSlug(slug);
  if (!hit?.film) return {};
  const copy = searchCopy(hit.id);
  const base = pageMetadata({
    // The title is the QUESTION the film answers, in the words a person types - not the
    // film's on-screen title. `/demo`'s "How to use it - and share it." is the
    // counter-example: nobody searches for that.
    title: copy.name,
    description: copy.description,
    path: `/watch/${slug}`,
    image: thumbnailFor(hit.id),
  });
  // `pageMetadata` hardcodes og:type=website, and its `rest` deliberately excludes
  // openGraph/twitter so a caller cannot half-override the block. Spreading on top keeps
  // its canonical/url/siteName derivation while declaring what this page actually is: a
  // video. og:video is what makes the page unfurl as a playable card rather than a link.
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'video.other',
      videos: [
        {
          url: `https://mcpindex.ai/promo/${hit.film.slug}.mp4`,
          type: 'video/mp4',
          width: 1920,
          height: 1080,
        },
      ],
    },
  };
}

export default async function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hit = filmForSlug(slug);
  if (!hit?.film) notFound();
  const { id, film } = hit;
  const copy = searchCopy(id);
  const ld = videoObject(film, {
    uploadDate: FILM_UPLOAD_DATE,
    thumbnail: thumbnailFor(id),
  });
  const other = allFilms().find((f) => f.id !== id);

  return (
    <article className="site-container pt-16 pb-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(ld) }} />

      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Film · {Math.floor(film.duration / 60)}:
          {String(film.duration % 60).padStart(2, '0')}
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">{copy.name}</h1>
        <p className="mt-4 max-w-3xl text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          {copy.description}
        </p>
      </header>

      <div className="mt-10 rule-t rule-b rule-l rule-r bg-black">
        <video
          className="w-full aspect-video"
          controls
          playsInline
          preload="metadata"
          poster={thumbnailFor(id)}
        >
          <source src={`/promo/${film.slug}.mp4`} type="video/mp4" />
          Your browser does not support the video tag.{' '}
          <a href={`/promo/${film.slug}.mp4`} className="underline">
            Download the .mp4
          </a>
          .
        </video>
      </div>

      {/* KEY MOMENTS. These are the same offsets as the `Clip` entries in the JSON-LD, read
          from the same manifest, so what a search result promises and what the page shows
          cannot disagree. */}
      <section className="mt-14" aria-labelledby="moments-heading">
        <h2 id="moments-heading" className="t-h3 font-medium text-[var(--color-ink)]">
          What happens, and when
        </h2>
        <ol className="mt-5 rule-t">
          {film.beats.map((b) => (
            <li key={b.id} className="rule-b row-2up-end py-3.5 px-2">
              <span className="text-[14.5px] leading-[1.5] text-[var(--color-cite)]">
                {b.title}
              </span>
              <span className="font-mono text-[12.5px] text-[var(--color-mute)] tabular-nums">
                {Math.floor(b.start / 60)}:{String(b.start % 60).padStart(2, '0')}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* THE TRANSCRIPT IS THE POINT. Rendered, not hidden: an answer engine quotes text it
          can read. Emitted into llms.txt as well, so the two never drift. */}
      <section className="mt-14" aria-labelledby="transcript-heading">
        <h2 id="transcript-heading" className="t-h3 font-medium text-[var(--color-ink)]">
          Full transcript
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
          Timestamps match the key moments above. Figures spoken in the film are stated as of
          the date shown on screen - they are measurements, not live numbers. The live record
          is in the{' '}
          <Link
            href="/ledger"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            public ledger
          </Link>
          .
        </p>
        <div className="mt-6 rule-t rule-b py-6">
          {film.beats.map((b) => (
            <div key={b.id} id={`t-${b.start}`} className="mb-7 last:mb-0 scroll-mt-20">
              <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
                {Math.floor(b.start / 60)}:{String(b.start % 60).padStart(2, '0')} · {b.title}
              </div>
              <p className="mt-2 text-[15px] leading-[1.65] text-[var(--color-ink)]">{b.vo}</p>
              {b.captions.length > 0 && (
                <p className="mt-1.5 font-mono text-[12.5px] leading-[1.5] text-[var(--color-mute)]">
                  On screen: {b.captions.join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <nav className="mt-12 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[12.5px]">
        {other?.film && (
          <Link
            href={pageFor(other.film)}
            className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] underline decoration-[var(--color-rule)] underline-offset-4"
          >
            {searchCopy(other.id).name} →
          </Link>
        )}
        <Link
          href="/demo"
          className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] underline decoration-[var(--color-rule)] underline-offset-4"
        >
          Embed &amp; share →
        </Link>
      </nav>
    </article>
  );
}
