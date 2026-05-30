import Link from 'next/link';
import type { Metadata } from 'next';
import { loadSeoContent } from '@/lib/seo-content';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'MCP guides',
  description:
    'Factual reference guides for the Model Context Protocol ecosystem.',
  alternates: { canonical: 'https://mcpindex.ai/seo' },
};

export default async function SeoIndex() {
  const pages = await loadSeoContent();
  return (
    <section className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Guides
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        MCP guides
      </h1>
      <p className="mt-5 max-w-[640px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Factual reference pages for the Model Context Protocol ecosystem.
      </p>

      {pages.length === 0 ? (
        <p className="mt-10 text-[15px] text-[var(--color-mute)]">
          No guides published yet.
        </p>
      ) : (
        <ul className="mt-10 space-y-3">
          {pages.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/seo/${p.slug}`}
                className="text-[16px] text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
              >
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
