import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers } from '@/lib/registry';
import { rankByQuality } from '@/lib/quality';
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/lib/categorize';
import { listScreened, listFixtures } from '@/lib/verdicts';
import { computeBadgeState } from '@/lib/badge';
import { jsonLdSafe } from '@/lib/jsonLd';

export const revalidate = 3600;

export async function generateStaticParams() {
  return ALL_CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ category: string }> },
): Promise<Metadata> {
  const { category } = await ctx.params;
  const label = CATEGORY_LABELS[category] ?? category;
  if (category === 'filesystem') {
    return {
      title: 'Filesystem MCP servers, screened for description honesty',
      description:
        'Filesystem MCP server descriptions screened for hidden instructions (semantic, advisory). A clean screen means the description is not lying, not that the tool is safe.',
      alternates: { canonical: 'https://mcpindex.ai/best/filesystem' },
    };
  }
  return {
    title: `Best ${label} MCP servers`,
    description: `${label} MCP servers ranked by MCP Quality Score across freshness, completeness, installability, documentation, and stability.`,
    alternates: { canonical: `https://mcpindex.ai/best/${category}` },
  };
}

export default async function BestCategory(
  ctx: { params: Promise<{ category: string }> },
) {
  const { category } = await ctx.params;
  if (!ALL_CATEGORIES.includes(category)) notFound();

  // Filesystem is the seed evidence category: its directory is defined by what
  // we actually screened (the verdict store), not the keyword categorizer.
  if (category === 'filesystem') return <FilesystemEvidence />;

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
          // "from the official MCP registry" was asserted over a set that can include
          // editorially admitted servers; count only what the claim covers.
          text: `${inCategory.filter((s) => s.source === 'registry').length} active ${label} servers are indexed from the official MCP registry.`,
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
        dangerouslySetInnerHTML={{
          __html: jsonLdSafe(faqLd),
        }}
      />
      <article className="site-container pt-16 pb-24">
        <Link
          href="/leaderboard"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)]"
        >
          ← Index
        </Link>
        <header className="mt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Ranked · {category}
          </div>
          <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
            Best {label} MCP servers.
          </h1>
          <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
            {inCategory.length} active servers indexed in this category.
            Ranked by{' '}
            <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
              MCP Quality Score
            </Link>
            . Updates daily.
          </p>
        </header>

        {ranked.length === 0 ? (
          <p className="mt-12 text-[14px] text-[var(--color-mute)]">
            No active servers indexed in this category yet.{' '}
            <Link href="/" className="underline hover:text-[var(--color-accent-strong)]">
              Search all servers
            </Link>{' '}
            or browse the{' '}
            <Link href="/leaderboard" className="underline hover:text-[var(--color-accent-strong)]">
              full leaderboard
            </Link>
            .
          </p>
        ) : (
          <ol className="mt-10 rule-t">
            {ranked.map((row, i) => (
              <li
                key={row.server.slug}
                className="rule-b row-rank-score px-2 py-5 group hover:bg-[var(--color-accent-soft)]/40 transition-colors"
              >
                <span className="font-mono text-[12px] text-[var(--color-mute)] tabular-nums">
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/server/${row.server.slug}`}
                    className="block font-medium text-[15.5px] text-[var(--color-ink)] group-hover:text-[var(--color-accent-strong)] truncate transition-colors"
                  >
                    {row.server.title}
                  </Link>
                  <p className="mt-1 text-[13px] text-[var(--color-cite)] line-clamp-2">
                    {row.server.description}
                  </p>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-[20px] text-[var(--color-ink)]">{row.score}</span>
                  <span className="text-[11px] text-[var(--color-mute)] ml-1">/100</span>
                </div>
              </li>
            ))}
          </ol>
        )}

        <section className="mt-16 rule-t pt-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-6">
            Other categories
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.filter((c) => c !== category).map((c) => (
              <Link
                key={c}
                href={`/best/${c}`}
                className="font-mono text-[11px] text-[var(--color-cite)] border border-[var(--color-rule)] px-2 py-1 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
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

// The filesystem evidence directory: the seed category. Defined by the verdict
// store (what we screened), not the keyword categorizer. Includes a clearly
// labeled adversarial-fixtures showcase so the FLAG state is visible.
// Hard cap on the rendered evidence list. listScreened() returns every
// screened server site-wide (not just filesystem ones - see the category
// filter below), and each row embeds full verdict JSON (dimensions,
// evidence quotes). Unbounded, this page has already once blown past
// Vercel's 19.07MB ISR response-size ceiling (FALLBACK_BODY_TOO_LARGE) as
// the verdict store grew past 10k entries. Mirrors the sibling category
// page's `.slice(0, 20)` pattern, sized up since this page's whole point
// is showing evidence breadth, not just a top-N ranking.
const FILESYSTEM_EVIDENCE_CAP = 200;

async function FilesystemEvidence() {
  const [allScreened, fixtures, servers] = await Promise.all([
    listScreened(),
    listFixtures(),
    loadServers(),
  ]);
  const bySlug = new Map(servers.map((s) => [s.slug, s]));
  // CORRECTNESS FIX: listScreened() is category-agnostic (every screened
  // server site-wide), but this page's copy claims "filesystem servers
  // screened". Filter to the actual filesystem category - same `.category`
  // field the sibling BestCategory() function already filters on - so the
  // count and list stop silently including every other category's servers.
  const screened = allScreened
    .filter(({ slug }) => bySlug.get(slug)?.category === 'filesystem')
    .slice(0, FILESYSTEM_EVIDENCE_CAP);
  // Public surfaces honor the accusation gate (same computeBadgeState the badge
  // uses - one source of truth): only a human-confirmed flag is "flagged"; a raw
  // screen flag is "held for review", never publicly accused or counted as flagged.
  const flaggedCount = screened.filter(({ verdict }) => computeBadgeState(verdict) === 'flagged').length;
  const heldCount = screened.filter(({ verdict }) => computeBadgeState(verdict) === 'review').length;

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Which filesystem MCP servers are safe to use?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `mcpindex screens filesystem MCP server descriptions for hidden instructions. ${screened.length} are screened; ${flaggedCount} were confirmed flagged after human review; ${heldCount} are held for review. This is a semantic, advisory screen of the description: a clean result means the description is not lying, not that the tool is safe to grant filesystem access.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What does the screen check?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'An LLM judge reads each tool description for instructions that would make the agent act outside the user request: read secret files, exfiltrate data, follow hidden instructions, or conceal actions. The directory coverage here is semantic-only and labeled PARTIAL: the deterministic conformance probe has not been run on these servers yet.',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdSafe(faqLd),
        }}
      />
      <article className="site-container pt-16 pb-24">
        <Link
          href="/best"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)]"
        >
          ← All categories
        </Link>
        <header className="mt-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Screened · filesystem
          </div>
          <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
            Filesystem MCP servers, screened for description honesty.
          </h1>
          <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
            {screened.length} servers screened · {flaggedCount} confirmed flagged ·{' '}
            {heldCount} held for review. An LLM judge reads each tool description for
            hidden instructions (semantic screen, advisory, status PARTIAL). A
            clean result means the description is not lying - <em>not</em> that
            the tool is safe to grant filesystem access. Method:{' '}
            <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
              how a finding is produced
            </Link>
            .
          </p>
          <p className="mt-3 text-[14px] text-[var(--color-cite)]">
            Own a filesystem MCP server?{' '}
            <Link href="/screen" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
              Screen its description →
            </Link>
          </p>
        </header>

        <ol className="mt-10 rule-t">
          {screened.map(({ slug, verdict }) => {
            const srv = bySlug.get(slug);
            const state = computeBadgeState(verdict);
            const pill =
              state === 'flagged'
                ? { cls: 'bg-rose-50 text-rose-900 border-rose-300', label: 'flagged · confirmed' }
                : state === 'review'
                  ? { cls: 'bg-amber-50 text-amber-900 border-amber-300', label: 'held for review' }
                  : { cls: 'bg-[var(--color-accent-soft)] text-[var(--color-cite)] border-[var(--color-rule)]', label: 'screened · no manipulation' };
            const evidence = verdict.dimensions[0]?.evidence?.[0]?.quote;
            return (
              <li
                key={slug}
                className="rule-b px-2 py-5 group hover:bg-[var(--color-accent-soft)]/40 transition-colors"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/server/${slug}`}
                    className="font-medium text-[15.5px] text-[var(--color-ink)] group-hover:text-[var(--color-accent-strong)] transition-colors"
                  >
                    {srv?.title ?? verdict.title ?? slug}
                  </Link>
                  <span
                    className={`font-mono text-[10.5px] uppercase tracking-[0.16em] px-2 py-1 border ${pill.cls}`}
                  >
                    {pill.label}
                  </span>
                </div>
                {srv?.description && (
                  <p className="mt-1.5 text-[13px] text-[var(--color-cite)] line-clamp-2">
                    {srv.description}
                  </p>
                )}
                {evidence && (
                  <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[var(--color-mute)]">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] mr-2">
                      evidence
                    </span>
                    &ldquo;{evidence}&rdquo;
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        {fixtures.length > 0 && (
          <section className="mt-16 rule-t pt-10">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
              Adversarial test fixtures
            </div>
            <p className="mb-6 text-[14px] leading-[1.55] text-[var(--color-cite)]">
              These are <strong>synthetic, hand-authored</strong> poisoned tool
              descriptions - <strong>not real registry servers</strong> - run
              through the same screen to show what it catches. They are excluded
              from the directory above and from search.
            </p>
            <div className="rule-t">
              {fixtures.map(({ slug, verdict }) => {
                const d = verdict.dimensions[0];
                const evidence = d?.evidence?.[0]?.quote;
                return (
                  <div key={slug} className="rule-b px-2 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] px-2 py-1 bg-rose-50 text-rose-900 border border-rose-300">
                        fail · {d?.severity?.toLowerCase() ?? 'critical'}
                      </span>
                      <span className="text-[14.5px] text-[var(--color-ink)]">
                        {verdict.title ?? slug}
                      </span>
                    </div>
                    {evidence && (
                      <p className="mt-2 text-[13px] leading-[1.5] text-[var(--color-cite)]">
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-mute)] mr-2">
                          evidence
                        </span>
                        &ldquo;{evidence}&rdquo;
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mt-16 rule-t pt-10">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-6">
            Other categories
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_CATEGORIES.filter((c) => c !== 'filesystem').map((c) => (
              <Link
                key={c}
                href={`/best/${c}`}
                className="font-mono text-[11px] text-[var(--color-cite)] border border-[var(--color-rule)] px-2 py-1 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
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
