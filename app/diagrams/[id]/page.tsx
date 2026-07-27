import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { jsonLdSafe } from '@/lib/jsonLd';
import { Figure } from '@/components/Figure';
import { CopyField } from '@/components/CopyField';
import { renderDiagram } from '@/components/diagrams';
import { getServerCount, getCategoryCount } from '@/lib/registry';
import {
  DIAGRAMS,
  getDiagram,
  attributionHtml,
  DIAGRAM_LICENSE,
  DIAGRAM_LICENSE_URL,
} from '@/lib/diagrams';

export const revalidate = 86400;

export function generateStaticParams() {
  return DIAGRAMS.map((d) => ({ id: d.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const d = getDiagram(id);
  if (!d) return pageMetadata({ title: 'Diagram not found', description: '', path: '/diagrams' });
  return pageMetadata({
    title: `${d.title} - MCP diagram`,
    // The claim is the description: it is the sentence we want quoted back.
    description: `${d.claim} Free reusable diagram (${DIAGRAM_LICENSE}) with a plain-text version, from mcpindex.ai.`,
    path: `/diagrams/${d.id}`,
    image: '/opengraph-image',
  });
}

export default async function DiagramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = getDiagram(id);
  if (!d) notFound();

  // Only the corpus funnel needs live counts; fetching them unconditionally keeps the page one
  // shape and costs nothing (both are snapshot-cached).
  const [servers, categories] = await Promise.all([getServerCount(), getCategoryCount()]);
  const facts = { servers: servers.toLocaleString('en-US'), categories: String(categories) };

  const pages = d.placements.filter((p) => !p.startsWith('/diagrams'));
  const idx = DIAGRAMS.findIndex((x) => x.id === d.id);
  const prev = DIAGRAMS[idx - 1];
  const next = DIAGRAMS[idx + 1];

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Diagrams', item: 'https://mcpindex.ai/diagrams' },
      {
        '@type': 'ListItem',
        position: 2,
        name: d.title,
        item: `https://mcpindex.ai/diagrams/${d.id}`,
      },
    ],
  };

  return (
    <article className="site-container pt-16 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(breadcrumb) }}
      />

      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        <Link href="/diagrams" className="hover:text-[var(--color-accent-strong)]">
          Diagrams
        </Link>{' '}
        &middot; Fig. {d.fig}
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">{d.title}</h1>
      <p className="mt-5 max-w-[68ch] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        {d.claim}
      </p>

      <Figure id={d.id} variant="page" twinVars={facts}>
        {renderDiagram(d.id, facts)}
      </Figure>

      <section className="mt-10 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          What the figure says
        </div>
        <p className="max-w-[70ch] text-[14.5px] leading-[1.6] text-[var(--color-cite)]">{d.alt}</p>
      </section>

      {pages.length > 0 && (
        <section className="mt-10 rule-t pt-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
            Where this is explained
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {pages.map((p) => (
              <Link
                key={p}
                href={p}
                className="font-mono text-[12.5px] text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                {p}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Use this diagram
        </div>
        <p className="max-w-[70ch] text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          Licensed{' '}
          <a
            href={DIAGRAM_LICENSE_URL}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            {DIAGRAM_LICENSE}
          </a>
          . Use it anywhere, including commercially. Keep the credit.
        </p>
        <div className="mt-5 space-y-4">
          <CopyField
            label="Credit line (HTML)"
            value={attributionHtml(d)}
            notes="Paste under the figure. That is the whole licence obligation."
          />
          <CopyField
            label="Direct SVG"
            value={`https://mcpindex.ai/diagrams/${d.id}/svg`}
            notes="Standalone image/svg+xml. Vector, editable, no stylesheet needed."
          />
        </div>
        <p className="mt-4 font-mono text-[11.5px] text-[var(--color-mute)]">
          Last reviewed {d.reviewed}
          {d.derives.length > 0 && (
            <> &middot; derived live from {d.derives.join(', ')} &middot; never hand-typed</>
          )}
        </p>
      </section>

      {d.queries.length > 0 && (
        <section className="mt-10 rule-t pt-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            Questions this answers
          </div>
          <p className="max-w-[70ch] text-[14px] leading-[1.7] text-[var(--color-mute)]">
            {d.queries.join(' &middot; ')}
          </p>
        </section>
      )}

      <nav className="mt-12 rule-t pt-6 flex flex-wrap justify-between gap-4 font-mono text-[12px]">
        {prev ? (
          <Link
            href={`/diagrams/${prev.id}`}
            className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
          >
            &larr; Fig. {prev.fig} {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/diagrams/${next.id}`}
            className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
          >
            Fig. {next.fig} {next.title} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  );
}
