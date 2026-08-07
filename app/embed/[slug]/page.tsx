import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { allFilms, getFilm, thumbnailFor } from '@/lib/films';
import { pageFor, searchCopy } from '@/lib/video';

/**
 * Player-only page, one per film, for iframe embeds and as the `embedUrl` in each film's
 * VideoObject.
 *
 * WHY IT EXISTS: the JSON-LD already declared `embedUrl: /embed/<slug>` and the site only
 * had a single static `/embed.html` that plays the overview film. Structured data pointing
 * at a 404 is worse than omitting the field - Google is entitled to distrust the whole
 * block - and with two films one static page could not have covered both anyway.
 *
 * `noindex`: this is a player surface, not a destination. The indexable page is
 * `/watch/<slug>`, which carries the transcript. Two URLs competing for one film is the
 * dilution the /watch split exists to avoid.
 */

export const revalidate = 86400;

const SLUGS = Object.fromEntries(
  allFilms().map(({ id, film }) => [pageFor(film).replace('/watch/', ''), id]),
) as Record<string, string>;

export function generateStaticParams() {
  return Object.keys(SLUGS).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const id = SLUGS[slug];
  if (!id) return { robots: { index: false, follow: false } };
  return {
    title: searchCopy(id).name,
    robots: { index: false, follow: false },
    alternates: { canonical: `https://mcpindex.ai/watch/${slug}` },
  };
}

export default async function EmbedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = SLUGS[slug];
  const film = id ? getFilm(id) : null;
  if (!film || !id) notFound();

  return (
    <div className="w-full h-screen bg-black flex items-center justify-center">
      <video
        className="w-full max-h-screen aspect-video"
        controls
        playsInline
        preload="metadata"
        poster={thumbnailFor(id)}
      >
        <source src={`/promo/${film.slug}.mp4`} type="video/mp4" />
        <a href={`/promo/${film.slug}.mp4`}>Download the .mp4</a>
      </video>
    </div>
  );
}
