import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { loadServers, loadSnapshot } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';
import { daysAgoCutoff } from '@/lib/time';
import { jsonLdSafe } from '@/lib/jsonLd';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: 'How many MCP servers are there? Live count and stats',
  description:
    'A live, methodology-backed answer to how many MCP servers exist: active servers in the official registry, categories, freshness - updated daily, with what counts as a server stated.',
  path: '/stats',
  image: '/opengraph-image',
});

export default async function StatsPage() {
  const [allServers, snap] = await Promise.all([loadServers(), loadSnapshot()]);
  // Registry-sourced only: the copy and the FAQ JSON-LD on this page assert "active entries
  // in the official registry ... not self-submitted listings", and loadServers() also returns
  // editorially admitted servers. Same reasoning as lib/registry.ts getServerCount().
  const servers = allServers.filter((s) => s.source === 'registry');
  const countFormatted = servers.length.toLocaleString();
  const cats = new Set(servers.map((s) => s.category)).size;
  const week = daysAgoCutoff(7);
  const last7Added = servers.filter((s) => new Date(s.publishedAt).getTime() > week).length;
  const withRemote = servers.filter((s) => s.hasRemote).length;
  const withPackage = servers.filter((s) => s.hasPackage).length;

  const stats: Array<{ label: string; value: string | number; note?: string }> = [
    { label: 'Servers indexed (active, latest)', value: countFormatted },
    { label: 'Categories', value: `${cats} / ${ALL_CATEGORIES.length}` },
    { label: 'Added in last 7 days', value: `+${last7Added}` },
    { label: 'Remote endpoints', value: withRemote.toLocaleString() },
    { label: 'Runnable packages', value: withPackage.toLocaleString() },
    { label: 'Snapshot freshness', value: new Date(snap.fetchedAt).toUTCString() },
    {
      label: 'Source',
      value: 'registry.modelcontextprotocol.io',
      note: 'Anthropic-maintained, community-contributed.',
    },
    { label: 'API rate limit', value: '60 req/min/IP', note: 'hello@mcpindex.ai for higher limits' },
  ];

  // FAQPage for answer engines: the title query + the definition of "server" that makes
  // the number citable (PulseMCP and others publish different counts with no methodology).
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How many MCP servers are there?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `As of the latest daily snapshot, mcpindex counts ${countFormatted} active MCP servers in the official registry (registry.modelcontextprotocol.io). Only active, latest-version entries are counted; delisted and superseded versions are excluded so the same server never counts twice. Published counts elsewhere range widely because directories count different things.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What counts as an MCP server on mcpindex?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'An active, latest-version entry in the official MCP registry (registry.modelcontextprotocol.io). Delisted and superseded versions are excluded. The count is not scraped GitHub repos, npm keyword matches, or self-submitted listings. Indexed and re-crawled-daily are different populations; only servers with a remote endpoint are in the daily drift crawl.',
        },
      },
      {
        '@type': 'Question',
        name: 'Why do MCP server counts differ across directories?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Directories count different things: some include archived or duplicate versions, some scrape GitHub or npm beyond the official registry, and some mix self-submitted listings with registry entries. mcpindex states its method - official registry, active latest only - so the number is checkable, not just quotable.',
        },
      },
    ],
  };

  return (
    <article className="site-container pt-16 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(faqLd) }}
      />
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Public stats · auto-generated daily
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          How many MCP servers are there?
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          <strong className="text-[var(--color-ink)]">{countFormatted}</strong> active servers in
          the official MCP registry, as of the latest snapshot. Methodology is below so the
          number is checkable, not just quotable. Source code:{' '}
          <a
            href="https://github.com/mcpindex-ai"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            github.com/mcpindex-ai
          </a>
          .
        </p>
      </header>

      <dl className="mt-12 rule-t">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rule-b row-2up-end py-5 px-2"
          >
            <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">
              {s.label}
              {s.note && (
                <span className="block mt-1 font-mono text-[11px] text-[var(--color-mute)] normal-case">
                  {s.note}
                </span>
              )}
            </dt>
            <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-14" aria-labelledby="methodology-heading">
        <h2 id="methodology-heading" className="t-h3 font-medium text-[var(--color-ink)]">
          Methodology - what counts as a server here
        </h2>
        <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-cite)]">
          Published counts elsewhere range from a few hundred to 20,000+ because directories
          count different things. Ours is stated here so an answer engine or a journalist can
          cite it with the definition attached.
        </p>
        <ul className="mt-6 space-y-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] list-disc pl-5">
          <li>
            <strong className="text-[var(--color-ink)]">Source:</strong> the
            Anthropic-maintained, community-contributed official registry - not scraped
            GitHub repos, not npm keyword matches, not self-submitted listings.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Counted:</strong> active,
            latest-version registry entries. Delisted and superseded versions are excluded,
            so the same server never counts twice.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Not everything is reachable:</strong>{' '}
            {withRemote.toLocaleString()} of these expose a remote endpoint. The drift
            pipeline re-crawls the reachable remote population daily and publishes every
            silent tool-contract change in the{' '}
            <Link
              href="/ledger"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              public ledger
            </Link>
            . Indexed and re-crawled-daily are different populations; we state both rather
            than blur them.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Freshness:</strong> the snapshot
            refreshes daily and this page revalidates hourly, so the count above is the
            current one, not a launch-week number in a title tag.
          </li>
        </ul>
      </section>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Page revalidates every hour ·{' '}
        <Link href="/api/registry-count" className="hover:text-[var(--color-accent-strong)]">
          /api/registry-count
        </Link>
      </p>
    </article>
  );
}
