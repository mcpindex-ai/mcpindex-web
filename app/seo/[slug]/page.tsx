import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSeoContent, loadSeoSlugs } from '@/lib/seo-content';

export const revalidate = 3600;

export async function generateStaticParams() {
  const slugs = await loadSeoSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await ctx.params;
  const content = await getSeoContent(slug);
  if (!content) return { title: 'Not found' };
  return {
    title: content.title,
    description: content.metaDescription,
    alternates: { canonical: `https://mcpindex.ai/seo/${slug}` },
    openGraph: {
      title: content.title,
      description: content.metaDescription,
      url: `https://mcpindex.ai/seo/${slug}`,
      type: 'article',
    },
  };
}

export default async function SeoPage(
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const content = await getSeoContent(slug);
  if (!content) notFound();

  const paragraphs = content.body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // only same-site root-relative links; reject protocol-relative ("//evil.com")
  // which also starts with "/" but resolves off-site.
  const internal = content.internalLinks.filter(
    (l) => l.startsWith('/') && !l.startsWith('//'),
  );

  // model-generated text goes into a dangerouslySetInnerHTML script; escape "<"
  // so a "</script>" in title/h1/description cannot break out of the LD block.
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: content.h1,
    description: content.metaDescription,
    url: `https://mcpindex.ai/seo/${slug}`,
  }).replace(/</g, '\\u003c');

  return (
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Guide
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        {content.h1}
      </h1>
      <div className="mt-8 space-y-5 text-[16px] leading-[1.65] text-[var(--color-cite)]">
        {(paragraphs.length ? paragraphs : [content.body]).map((p, i) => (
          <p key={`${i}-${p.slice(0, 16)}`}>{p}</p>
        ))}
      </div>

      {internal.length > 0 && (
        <div className="mt-12 rule-t pt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Related
          </div>
          <ul className="mt-3 space-y-1.5">
            {internal.map((href) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-[15px] text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
                >
                  {href}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.citationIds.length > 0 && (
        <p className="mt-10 text-[12.5px] leading-[1.6] text-[var(--color-mute)]">
          Sourced from the mcpindex registry snapshot:{' '}
          {content.citationIds.join(', ')}.
        </p>
      )}
    </article>
  );
}
