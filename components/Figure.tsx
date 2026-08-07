import Link from 'next/link';
import type { ReactNode } from 'react';
import { jsonLdSafe } from '@/lib/jsonLd';
import { COPYRIGHT_NOTICE, DIAGRAM_LICENSE, DIAGRAM_LICENSE_URL, getDiagram, renderTwin } from '@/lib/diagrams';

/**
 * The ONE way a diagram reaches a page.
 *
 * WHY THIS EXISTS
 * Answer engines cannot see an image. ChatGPT, Claude and Perplexity retrieving this site get
 * the DOM, /llms.txt and JSON-LD - never pixels. A diagram shipped as a raster is not merely
 * invisible to them, it REMOVES the load-bearing explanation from the text. So a figure is not
 * allowed onto a page without four things, and this component is what makes "not allowed"
 * structural rather than a habit:
 *
 *   1. inline SVG (the caller's child) - node labels are DOM text and get crawled;
 *   2. an aria-label stating the CONCLUSION, set by the SVG component from the registry;
 *   3. a figcaption carrying the CLAIM, not a label like "Fig 3 - Architecture";
 *   4. the ASCII twin, in an open-able <details> - the artifact an engine actually quotes;
 *   plus an ImageObject in the page graph so the figure is addressable as a thing.
 *
 * All of it is read from lib/diagrams.ts by id, so a caller cannot pass a caption that
 * disagrees with the twin. Server component: no client JS, no hydration cost.
 */
export function Figure({
  id,
  children,
  twinVars,
  variant = 'inline',
  className = '',
}: {
  /** Registry id. Must exist in lib/diagrams.ts - an unknown id renders nothing. */
  id: string;
  /** The inline <svg>. Sets its own role="img" + aria-label from the registry. */
  children: ReactNode;
  /** Values for `{token}` placeholders in the twin (live counts, derived progress). */
  twinVars?: Record<string, string>;
  /** 'page' drops the self-referential permalink line on /diagrams/<id>. */
  variant?: 'inline' | 'page';
  className?: string;
}) {
  const d = getDiagram(id);
  if (!d) return null;

  const href = `/diagrams/${d.id}`;
  const twin = renderTwin(d.twin, twinVars);

  const imageObject = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    '@id': `https://mcpindex.ai${href}#figure`,
    contentUrl: `https://mcpindex.ai${href}/svg`,
    url: `https://mcpindex.ai${href}`,
    name: d.title,
    caption: d.claim,
    description: d.alt,
    encodingFormat: 'image/svg+xml',
    license: DIAGRAM_LICENSE_URL,
    acquireLicensePage: `https://mcpindex.ai${href}`,
    creditText: 'mcpindex.ai',
    creator: { '@type': 'Organization', '@id': 'https://mcpindex.ai/#org' },
    // The fourth field of Google's image-metadata set. Without it the item is valid but
    // not eligible for the licensable-image treatment - which is the whole reason the
    // other three are here.
    copyrightNotice: COPYRIGHT_NOTICE,
    copyrightHolder: { '@type': 'Organization', '@id': 'https://mcpindex.ai/#org' },
  };

  return (
    <figure className={`my-10 ${className}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(imageObject) }}
      />

      <div className="overflow-x-auto rule-t rule-b rule-l rule-r bg-white px-4 py-5 sm:px-6">
        <div className="min-w-[680px]">{children}</div>
      </div>

      <figcaption className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
        Fig. {d.fig} &middot; {d.claim}
      </figcaption>

      {/* The twin. Open-able rather than hidden: a sighted reader who prefers text gets it too,
          and a screen reader reaches the same content the answer engines quote. */}
      <details className="mt-3">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-accent-strong)] hover:text-[var(--color-accent-deep)]">
          Read Fig. {d.fig} as text
        </summary>
        <pre className="mt-3 overflow-x-auto bg-[var(--color-ink)] px-4 py-3.5 font-mono text-[11.5px] leading-[1.55] text-zinc-100">
          <code>{twin}</code>
        </pre>
      </details>

      {variant === 'inline' && (
        <p className="mt-2.5 font-mono text-[11px] text-[var(--color-mute)]">
          <Link
            href={href}
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            Permalink, SVG &amp; reuse
          </Link>
          {' · '}
          {DIAGRAM_LICENSE}
        </p>
      )}
    </figure>
  );
}
