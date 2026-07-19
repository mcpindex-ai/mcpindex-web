import type { Metadata } from 'next';

/**
 * Per-page SEO/social metadata for static pages.
 *
 * Why: the root layout declares openGraph/twitter for the HOMEPAGE identity
 * (og:url=https://mcpindex.ai, homepage title/description). Next.js merges
 * metadata shallowly and does NOT auto-derive openGraph from a page's own
 * title/description, so any static page that omits openGraph inherits the
 * homepage's og:title/og:description/og:url verbatim - social shares of
 * /install, /docs, /trust, etc. then render and attribute as the homepage.
 * Routing each static page's own title/description/path through this helper
 * gives every page an explicit, self-consistent openGraph + twitter block so
 * the root's homepage OG never leaks down.
 */

const SITE_URL = 'https://mcpindex.ai';
const SITE_NAME = 'mcpindex.ai';
const TWITTER_SITE = '@mcpindex';

interface PageMetadataArgs {
  /** Page title (og:title and twitter:title reuse this verbatim). */
  title: string;
  /** Page description (og:description and twitter:description reuse this verbatim). */
  description: string;
  /** Route path beginning with '/', e.g. '/install'. Builds the canonical + og:url. */
  path: string;
  /**
   * OG/Twitter card image. REQUIRED for any page WITHOUT its own
   * `opengraph-image.tsx`: the explicit openGraph block below replaces the root's,
   * which suppresses the *inherited* root card image (a same-segment
   * `opengraph-image.tsx` still merges in, so pages that have one omit this). Pass
   * `'/opengraph-image'` to reuse the root card. Omit it ONLY when the page ships its
   * own `opengraph-image.tsx`.
   */
  image?: string;
  /**
   * Extra alternates merged over the derived canonical (e.g. RSS `types`).
   * `canonical` defaults to the path-derived URL but can be overridden here.
   */
  alternates?: Metadata['alternates'];
  /** Any additional Metadata fields (e.g. `robots`) passed through untouched. */
  rest?: Omit<Metadata, 'title' | 'description' | 'openGraph' | 'twitter' | 'alternates'>;
}

/**
 * Build a page's Metadata with a self-consistent openGraph + twitter block
 * derived from its own title/description/path, plus a canonical URL.
 */
export function pageMetadata({
  title,
  description,
  path,
  image,
  alternates,
  rest,
}: PageMetadataArgs): Metadata {
  const url = `${SITE_URL}${path}`;
  const images = image ? [image] : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      // Only set when the page has no own opengraph-image.tsx (see `image` doc). When
      // omitted, a same-segment opengraph-image.tsx still supplies the card.
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER_SITE,
      title,
      description,
      ...(images ? { images } : {}),
    },
    alternates: {
      canonical: url,
      ...alternates,
    },
    ...rest,
  };
}
