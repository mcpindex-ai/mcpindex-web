import Link from 'next/link';
import type { Metadata } from 'next';
import { loadGuides } from '@/lib/guides-content';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const guides = await loadGuides();
  return {
    title: 'MCP guides',
    description:
      'Practical guides for the Model Context Protocol ecosystem: trust and security, comparisons, and integration how-tos.',
    alternates: { canonical: 'https://mcpindex.ai/guides' },
    // an empty index is a thin page - keep it out of the index until it has
    // content (still followable so the eventual guide links are crawled).
    robots: guides.length === 0 ? { index: false, follow: true } : undefined,
  };
}

export default async function GuidesIndex() {
  const guides = await loadGuides();
  return (
    <section className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Guides
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        MCP guides
      </h1>
      <p className="mt-5 max-w-[640px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Trust and security reviews, comparisons, and integration how-tos for the
        Model Context Protocol ecosystem.
      </p>

      {guides.length === 0 ? (
        <p className="mt-10 text-[15px] text-[var(--color-mute)]">
          No guides published yet.
        </p>
      ) : (
        <ul className="mt-10 space-y-3">
          {guides.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="text-[16px] text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
              >
                {g.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
