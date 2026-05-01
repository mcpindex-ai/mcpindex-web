import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers } from '@/lib/registry';
import { rankByQuality } from '@/lib/quality';
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export async function generateStaticParams() {
  return ALL_CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ category: string }> },
): Promise<Metadata> {
  const { category } = await ctx.params;
  const label = CATEGORY_LABELS[category] ?? category;
  return {
    title: `Best ${label} MCP servers`,
    description: `Curated picks for ${label} MCP servers, ranked by MCP Quality Score across freshness, completeness, installability, documentation, and stability.`,
    alternates: { canonical: `https://mcpindex.ai/best/${category}` },
  };
}

export default async function BestCategory(
  ctx: { params: Promise<{ category: string }> },
) {
  const { category } = await ctx.params;
  if (!ALL_CATEGORIES.includes(category)) notFound();
  const label = CATEGORY_LABELS[category] ?? category;

  const all = await loadServers();
  const inCategory = all.filter((s) => s.category === category);
  const ranked = rankByQuality(inCategory).slice(0, 20);

  // FAQ JSON-LD for answer-engine optimization
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the best ${label} MCP server?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: ranked[0]
            ? `${ranked[0].server.title} (${ranked[0].server.name}) currently ranks #1 with a Quality Score of ${ranked[0].score}/100.`
            : 'No active servers indexed in this category yet.',
        },
      },
      {
        '@type': 'Question',
        name: `How many ${label} MCP servers exist?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${inCategory.length} active ${label} servers are indexed from the official MCP registry.`,
        },
      },
      {
        '@type': 'Question',
        name: 'How is the ranking calculated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Five-dimension composite score: freshness (recency of update), completeness (metadata populated), installability (runnable package or remote URL present), documentation (env vars described, repo present), and semver stability.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <article className="mx-auto max-w-[920px] px-6 sm:px-10 pt-16 pb-24">
        <Link
          href="/leaderboard"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[--color-mute] hover:text-[--color-accent]"
        >
          ← Index
        </Link>
        <header className="mt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
            §01&nbsp;&nbsp;Curated · {category}
          </div>
          <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
            Best {label} MCP servers.
          </h1>
          <p className="mt-4 max-w-[680px] text-[15.5px] leading-[1.55] text-[--color-cite]">
            {inCategory.length} active servers indexed in this category.
            Ranked by{' '}
            <Link href="/methodology" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
              MCP Quality Score
            </Link>
            . Updates daily.
          </p>
        </header>

        {ranked.length === 0 ? (
          <p className="mt-12 text-[14px] text-[--color-mute]">
            No active servers indexed in this category yet.{' '}
            <Link href="/" className="underline hover:text-[--color-accent]">
              Search all servers
            </Link>{' '}
            or browse the{' '}
            <Link href="/leaderboard" className="underline hover:text-[--color-accent]">
              full leaderboard
            </Link>
            .
          </p>
        ) : (
          <ol className="mt-10 rule-t">
            {ranked.map((row, i) => (
              <li
                key={row.server.slug}
                className="rule-b grid grid-cols-[40px_1fr_auto] gap-4 px-2 py-5 items-baseline group hover:bg-[--color-accent-soft]/40 transition-colors"
              >
                <span className="font-mono text-[12px] text-[--color-mute] tabular-nums">
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/server/${row.server.slug}`}
                    className="block font-medium text-[15.5px] text-[--color-ink] group-hover:text-[--color-accent] truncate transition-colors"
                  >
                    {row.server.title}
                  </Link>
                  <p className="mt-1 text-[13px] text-[--color-cite] line-clamp-2">
                    {row.server.description}
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-[20px] text-[--color-ink]">{row.score}</span>
                  <span className="text-[11px] text-[--color-mute] ml-1">/100</span>
                </div>
              </li>
            ))}
          </ol>
        )}

        <section className="mt-16 rule-t pt-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-6">
            §02&nbsp;&nbsp;Other categories
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.filter((c) => c !== category).map((c) => (
              <Link
                key={c}
                href={`/best/${c}`}
                className="font-mono text-[11px] text-[--color-cite] border border-[--color-rule] px-2 py-1 hover:border-[--color-accent] hover:text-[--color-accent] transition-colors"
              >
                {CATEGORY_LABELS[c] ?? c}
              </Link>
            ))}
          </div>
        </section>
      </article>
    </>
  );
}
