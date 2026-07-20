import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  citationToServerSlug,
  getGuide,
  loadGuideSlugs,
} from '@/lib/guides-content';
import { getServer } from '@/lib/registry';
import { jsonLdSafe } from '@/lib/jsonLd';
import { Prose } from '@/components/proseComponents';
import { GuideWalkthrough } from '@/components/GuideWalkthrough';

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await loadGuideSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await ctx.params;
  const guide = await getGuide(slug);
  if (!guide) return { title: 'Not found' };
  return {
    title: guide.title,
    description: guide.metaDescription,
    alternates: { canonical: `https://mcpindex.ai/guides/${slug}` },
    openGraph: {
      title: guide.title,
      description: guide.metaDescription,
      url: `https://mcpindex.ai/guides/${slug}`,
      type: 'article',
    },
  };
}

// Deterministic internal-link graph: derive referenced /server cards from the
// guide's citation ids and VERIFY each exists in the registry (no dead links,
// no trust in model-written hrefs). This is the hub->spoke equity flow.
async function referencedServers(
  citationIds: string[],
): Promise<{ slug: string; name: string }[]> {
  const seen = new Set<string>();
  const out: { slug: string; name: string }[] = [];
  for (const cid of citationIds) {
    const slug = citationToServerSlug(cid);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const server = await getServer(slug);
    if (server) out.push({ slug, name: server.name });
  }
  return out;
}

export default async function GuidePage(
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const guide = await getGuide(slug);
  if (!guide) notFound();

  const servers = await referencedServers(guide.citationIds);

  const url = `https://mcpindex.ai/guides/${slug}`;
  const org = { '@type': 'Organization', name: 'mcpindex', url: 'https://mcpindex.ai' };

  // model-generated text goes into a dangerouslySetInnerHTML script; escape "<"
  // so a "</script>" in title/h1/description cannot break out of the LD block.
  // FAQPage is added when the guide carries Q&A pairs - answer engines (ChatGPT,
  // Perplexity, Google AI) extract those question/answer nodes directly.
  const graph: unknown[] = [
    {
      '@type': 'TechArticle',
      headline: guide.h1,
      description: guide.metaDescription,
      url,
      author: org,
      publisher: org,
      ...(guide.updated ? { datePublished: guide.updated, dateModified: guide.updated } : {}),
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Guides', item: 'https://mcpindex.ai/guides' },
        { '@type': 'ListItem', position: 2, name: guide.h1, item: url },
      ],
    },
  ];
  if (guide.faq && guide.faq.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: guide.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    });
  }
  // A walkthrough is a HowTo: emit the step list (+ totalTime) so rich results
  // and answer engines (ChatGPT/Perplexity/Google AI) extract the ordered steps.
  const isWalkthrough = (guide.steps?.length ?? 0) > 0;
  if (isWalkthrough && guide.steps) {
    graph.push({
      '@type': 'HowTo',
      name: guide.h1,
      description: guide.metaDescription,
      ...(guide.estMinutes ? { totalTime: `PT${guide.estMinutes}M` } : {}),
      step: guide.steps.map((s, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: s.heading,
        url: `${url}#${s.id}`,
      })),
    });
  }
  const jsonLd = jsonLdSafe({ '@context': 'https://schema.org', '@graph': graph });

  return (
    <article className="site-container pt-16 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <nav className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        <Link href="/guides" className="hover:text-[var(--color-accent-strong)]">
          Guides
        </Link>
      </nav>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        {guide.h1}
      </h1>
      {isWalkthrough ? (
        <GuideWalkthrough guide={guide} />
      ) : (
        <div className="mt-8">
          <Prose>{guide.body}</Prose>
        </div>
      )}

      {guide.faq && guide.faq.length > 0 && (
        <section className="mt-12 rule-t pt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-5">
            Questions
          </div>
          <dl className="space-y-6">
            {guide.faq.map((f, i) => (
              <div key={i}>
                <dt className="text-[16px] font-medium text-[var(--color-ink)]">{f.q}</dt>
                <dd className="mt-1.5 text-[15px] leading-[1.6] text-[var(--color-cite)]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {servers.length > 0 && (
        <div className="mt-12 rule-t pt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Servers referenced
          </div>
          <ul className="mt-3 space-y-1.5">
            {servers.map((s) => (
              <li key={s.slug}>
                <Link
                  href={`/server/${s.slug}`}
                  className="text-[15px] text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                >
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
