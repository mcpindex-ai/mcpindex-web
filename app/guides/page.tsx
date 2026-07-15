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
  // Product walkthroughs (in-product, step-by-step journeys) lead; the classic
  // trust/comparison guides follow. Both come from the same content/guides store.
  // Walkthroughs run the activation funnel, so order them by their declared
  // `order` (install first), falling back to slug; classic guides stay A-Z.
  const walkthroughs = guides
    .filter((g) => g.kind === 'walkthrough')
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.slug.localeCompare(b.slug));
  const classic = guides.filter((g) => g.kind !== 'walkthrough');

  return (
    <section className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Guides
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        MCP guides
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Trust and security reviews, comparisons, and integration how-tos for the
        Model Context Protocol ecosystem.
      </p>

      {guides.length === 0 ? (
        <p className="mt-10 text-[15px] text-[var(--color-mute)]">
          No guides published yet.
        </p>
      ) : (
        <>
          {walkthroughs.length > 0 && (
            <div className="mt-12">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
                Product walkthroughs
              </div>
              <ul className="mt-4 rule-t">
                {walkthroughs.map((g) => (
                  <li key={g.slug} className="rule-b">
                    <Link
                      href={`/guides/${g.slug}`}
                      className="group flex items-baseline justify-between gap-4 py-4 hover:bg-[var(--color-accent-soft)]"
                    >
                      <span>
                        <span className="text-[16px] font-medium text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">
                          {g.title}
                        </span>
                        {g.outcome && (
                          <span className="mt-0.5 block text-[13.5px] leading-[1.5] text-[var(--color-mute)]">
                            {g.outcome}
                          </span>
                        )}
                      </span>
                      {g.estMinutes && (
                        <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                          ~{g.estMinutes} min
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {classic.length > 0 && (
            <div className="mt-14">
              {walkthroughs.length > 0 && (
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
                  Guides
                </div>
              )}
              <ul className={`${walkthroughs.length > 0 ? 'mt-4' : 'mt-10'} space-y-3`}>
                {classic.map((g) => (
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
            </div>
          )}
        </>
      )}
    </section>
  );
}
