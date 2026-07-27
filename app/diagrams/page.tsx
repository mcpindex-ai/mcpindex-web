import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { jsonLdSafe } from '@/lib/jsonLd';
import { DIAGRAMS, DIAGRAM_LICENSE, DIAGRAM_LICENSE_URL } from '@/lib/diagrams';

export const revalidate = 86400;

export const metadata: Metadata = pageMetadata({
  title: 'MCP diagrams - architecture, trust boundary, drift, blast radius',
  description:
    'Free, reusable diagrams of how MCP tool calls actually work: where an in-path gate sits, what crosses the trust boundary, the ChangeKind taxonomy, blast radius, and the drift ledger. Inline SVG with a text version of every figure. CC BY 4.0.',
  path: '/diagrams',
  image: '/opengraph-image',
});

/**
 * The diagram gallery.
 *
 * WHY IT EXISTS, in one line: anyone writing about MCP security needs a diagram, will not draw
 * one, and will take ours - so make taking it easy and attributed. Every figure is CC BY 4.0
 * with a copy-paste credit line and a standalone SVG.
 *
 * It is also an internal-link hub. A bare gallery is a dead end that eats crawl budget; each
 * entry routes back to the page where the concept is actually explained, so the crawler that
 * arrives here leaves toward the pages that matter.
 */
export default function DiagramsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': 'https://mcpindex.ai/diagrams#page',
    name: 'MCP diagrams',
    description:
      'Reusable diagrams of MCP tool-call architecture, trust boundary, contract drift and blast radius. CC BY 4.0.',
    license: DIAGRAM_LICENSE_URL,
    isPartOf: { '@id': 'https://mcpindex.ai/#website' },
    hasPart: DIAGRAMS.map((d) => ({
      '@type': 'ImageObject',
      '@id': `https://mcpindex.ai/diagrams/${d.id}#figure`,
      name: d.title,
      caption: d.claim,
      contentUrl: `https://mcpindex.ai/diagrams/${d.id}/svg`,
      encodingFormat: 'image/svg+xml',
      license: DIAGRAM_LICENSE_URL,
    })),
  };

  return (
    <article className="site-container pt-16 pb-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} />

      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Diagrams &middot; {DIAGRAMS.length} figures &middot; {DIAGRAM_LICENSE}
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        How MCP tool calls actually work, drawn.
      </h1>
      <p className="mt-5 max-w-[68ch] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Every figure on this site, in one place: where an in-path gate sits, what crosses the trust
        boundary, what a silent contract change looks like, and how a call&rsquo;s blast radius is
        graded. Each one is inline SVG with a text version, so it works in a browser, in a screen
        reader, and in an answer engine that cannot see pictures.
      </p>
      <p className="mt-4 max-w-[68ch] text-[14.5px] leading-[1.6] text-[var(--color-mute)]">
        Take them. They are{' '}
        <a
          href={DIAGRAM_LICENSE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          {DIAGRAM_LICENSE}
        </a>
        : use them in a post, a deck or a doc, commercially or not, and credit mcpindex.ai. Each
        page below has the SVG and a copy-paste credit line.
      </p>

      <div className="mt-12 rule-t">
        {DIAGRAMS.map((d) => (
          <Link
            key={d.id}
            href={`/diagrams/${d.id}`}
            className="rule-b group grid grid-cols-[52px_1fr] gap-4 py-7 px-2 sm:grid-cols-[72px_1fr_minmax(190px,240px)] sm:gap-8 hover:bg-[var(--color-accent-soft)]/40 transition-colors"
          >
            <div className="pt-1 font-mono text-[12px] tabular-nums text-[var(--color-accent-strong)]">
              {d.fig}
            </div>
            <div>
              <h2 className="t-h4 font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent-strong)]">
                {d.title}
              </h2>
              <p className="mt-1.5 max-w-[62ch] text-[14px] leading-[1.55] text-[var(--color-cite)]">
                {d.claim}
              </p>
            </div>
            <div className="col-span-2 sm:col-span-1 sm:text-right">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] leading-[1.7] text-[var(--color-mute)]">
                {d.placements
                  .filter((p) => !p.startsWith('/diagrams'))
                  .slice(0, 3)
                  .join(' · ')}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Why every figure has a text version
        </div>
        <p className="max-w-[68ch] text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          An answer engine cannot see an image. A diagram shipped as a picture does not just fail
          to help a model, it takes the explanation out of the page. So each figure here is inline
          SVG - its labels are real text - and carries a plain-text rendering of the same content.
          That is also the accessible version, and the one you can paste into an issue.
        </p>
      </div>
    </article>
  );
}
