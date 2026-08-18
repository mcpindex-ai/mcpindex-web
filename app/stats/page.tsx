import Link from 'next/link';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';
import { daysAgoCutoff } from '@/lib/time';
import { jsonLdSafe } from '@/lib/jsonLd';
import { loadSourceLiveness, livenessLookup, SOURCE_LIVENESS_CENSUS } from '@/lib/sourceLiveness';
import type { ServerRemovalsFile } from '@/lib/serverRemovals';
import removalsJson from '@/data/server-removals.json';
import edition from '@/data/report-edition-v1.json';

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: 'How many MCP servers are there? Live count and stats',
  description:
    'A live, methodology-backed answer to how many MCP servers exist: active servers in the official registry, unreachable-source rate, registry churn with dated tombstones, silent drift share, and 2026-07-28 (MCP 2.0) adoption tracking - with every method and as-of date stated.',
  path: '/stats',
  image: '/opengraph-image',
});

export default async function StatsPage() {
  const [allServers, snap, livenessDoc, liveness] = await Promise.all([
    loadServers(),
    loadSnapshotMeta(),
    loadSourceLiveness(),
    livenessLookup(),
  ]);
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

  // Dead sources: intersect the liveness artifact with the CURRENT active set, so the
  // percentage is "share of currently listed servers" - the raw artifact also holds
  // entries whose server has since left the registry, a mismatched denominator.
  // loadSourceLiveness() fail-closes to an empty doc past its 60-day staleness gate,
  // so deadListed === 0 means "withhold the stat", never "everything is alive".
  const deadListed = servers.filter((s) => liveness(s) !== null).length;
  const deadPct = ((deadListed / Math.max(servers.length, 1)) * 100).toFixed(1);
  const livenessAsOf = livenessDoc.generated_at ? livenessDoc.generated_at.slice(0, 10) : null;

  const removals = removalsJson as ServerRemovalsFile;
  const goneCount = Object.keys(removals.gone).length;
  const goneSince = Object.values(removals.gone)
    .map((g) => g.removedAt)
    .filter(Boolean)
    .sort()[0];

  // Deliberately hardcoded dated reading - the era-census panel exports no artifact yet.
  // One source for the visible section AND the FAQ so the two can never disagree on the
  // same page (the exact failure mode the census-figure incident in lib/sourceLiveness.ts
  // documents).
  const MCP2_PANEL = { endpoints: 200, asOf: '2026-08-16', since: '2026-08-13' } as const;

  // Every drift figure renders from the frozen edition artifact rather than being typed
  // into copy - hand-copied stats contradicted their own DOI for four days once (see the
  // header comment in lib/sourceLiveness.ts).
  const drift = edition.aggregates;

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

  // Insert AFTER "Runnable packages" (label match, not a magic index - a new base row
  // must not silently shift these into the meta block).
  const insertAt = stats.findIndex((s) => s.label === 'Snapshot freshness');
  const dataRows: typeof stats = [
    ...(deadListed > 0 && livenessAsOf
      ? [
          {
            label: 'Listed servers whose source is unreachable',
            value: `${deadListed.toLocaleString()} (${deadPct}%)`,
            note: `Repo not publicly accessible from two independent vantages, checks 48h+ apart; as of ${livenessAsOf}`,
          },
        ]
      : []),
    ...(goneCount > 0 && goneSince
      ? [
          {
            label: 'Registry removals recorded',
            value: `${goneCount} since ${goneSince}`,
            note: 'Dated tombstones since tracking began; removed pages serve 410, renames 308.',
          },
        ]
      : []),
  ];
  stats.splice(insertAt < 0 ? stats.length : insertAt, 0, ...dataRows);

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
      ...(deadListed > 0 && livenessAsOf
        ? [
            {
              '@type': 'Question',
              name: 'How many MCP servers are dead or abandoned?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: `mcpindex publishes the observation, not the inference: as of ${livenessAsOf}, ${deadListed.toLocaleString()} currently listed MCP servers (${deadPct}% of the active registry) have a source repository that is confirmed no longer publicly accessible, verified from two independent vantages with checks at least 48 hours apart. That can mean deletion or a deliberate flip to private - the observation cannot distinguish the two, so no abandonment claim is made per server. The frozen baseline census (2026-07-20, DOI 10.5281/zenodo.21501868) found ${SOURCE_LIVENESS_CENSUS.reposUnreachable} of ${SOURCE_LIVENESS_CENSUS.reposTotal} distinct repositories unreachable - ${SOURCE_LIVENESS_CENSUS.ratioPhrase} - affecting ${SOURCE_LIVENESS_CENSUS.serversAffected} of ${SOURCE_LIVENESS_CENSUS.serversTotal} servers.`,
              },
            },
          ]
        : []),
      {
        '@type': 'Question',
        name: 'How much do MCP tool contracts change silently?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Across ${edition.coverage.pair_count} snapshot pairs in a ${edition.coverage.elapsed_days}-day measurement window ending ${edition.coverage.last_snapshot.slice(0, 10)}, the mcpindex drift pipeline recorded ${drift.events_total.toLocaleString()} tool-contract change events and ${drift.deduped_safety_incidents.toLocaleString()} deduplicated safety-relevant incidents. ${drift.silent_share_pct}% of those incidents shipped while the server's declared version did not change. Frozen and citable as drift report edition v1, DOI ${edition.doi}.`,
        },
      },
      {
        '@type': 'Question',
        name: 'How many MCP servers support the 2026-07-28 spec (MCP 2.0)?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Nobody publishes a measured answer yet, including mcpindex. A daily probe panel has been recording which protocol era each registry endpoint speaks (per-request metadata vs the legacy initialize handshake) since ${MCP2_PANEL.since}; enrollment is in its first weeks, at ${MCP2_PANEL.endpoints} endpoints as of ${MCP2_PANEL.asOf}, so the adoption rate is deliberately withheld until coverage is a defensible share of the remote-declaring fleet. The rate will publish on this page.`,
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
            {withRemote.toLocaleString()} of these <em>declare</em> a remote endpoint, which is a
            ceiling rather than a coverage figure - declaring one is not the same as answering.
            The drift pipeline diffs only the servers reachable in both of two consecutive
            snapshots, a strict and materially smaller subset, and publishes every silent
            tool-contract change in the{' '}
            <Link
              href="/ledger"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              public ledger
            </Link>
            . Indexed, remote-declaring and actually-crawled are three different populations, and
            only the first two are counted on this page - so do not read the number above as
            drift-pipeline coverage.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Freshness:</strong> the snapshot
            refreshes daily and this page revalidates hourly, so the count above is the
            current one, not a launch-week number in a title tag.
          </li>
        </ul>
      </section>

      {deadListed > 0 && livenessAsOf && (
        <section className="mt-14" aria-labelledby="deadsources-heading">
          <h2 id="deadsources-heading" className="t-h3 font-medium text-[var(--color-ink)]">
            Unreachable sources and registry churn
          </h2>
          <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-cite)]">
            <strong className="text-[var(--color-ink)]">{deadListed.toLocaleString()}</strong> of
            the servers counted above ({deadPct}%) have a source repository that is no longer
            publicly accessible: unreachable from two independent vantages, checks at least 48
            hours apart, as of {livenessAsOf}. That can mean deleted or deliberately flipped
            private - the observation cannot tell the two apart, so this page publishes the
            observation and not an abandonment claim. The frozen 2026-07-20 baseline found{' '}
            {SOURCE_LIVENESS_CENSUS.reposUnreachable} of {SOURCE_LIVENESS_CENSUS.reposTotal}{' '}
            distinct repositories unreachable - {SOURCE_LIVENESS_CENSUS.ratioPhrase} - affecting{' '}
            {SOURCE_LIVENESS_CENSUS.serversAffected} of {SOURCE_LIVENESS_CENSUS.serversTotal}{' '}
            servers. Method, hand-verified sample and deposition are in the{' '}
            <Link
              href="/research/source-liveness"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              source liveness census
            </Link>{' '}
            (DOI 10.5281/zenodo.21501868).
          </p>
          {goneCount > 0 && goneSince && (
            <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-cite)]">
              The registry itself churns: {goneCount} removals recorded since tracking began on{' '}
              {goneSince}, each with a dated tombstone, so churn here is measurable rather than
              anecdotal. Removals before that date are not counted. Removed server pages answer
              410; renamed ones redirect with 308.
            </p>
          )}
        </section>
      )}

      <section className="mt-14" aria-labelledby="drift-heading">
        <h2 id="drift-heading" className="t-h3 font-medium text-[var(--color-ink)]">
          Drift, measured
        </h2>
        <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-cite)]">
          Across {edition.coverage.pair_count} snapshot pairs in a{' '}
          {edition.coverage.elapsed_days}-day window ending{' '}
          {edition.coverage.last_snapshot.slice(0, 10)}, the drift pipeline recorded{' '}
          {drift.events_total.toLocaleString()} tool-contract change events and{' '}
          {drift.deduped_safety_incidents.toLocaleString()} deduplicated safety-relevant
          incidents.{' '}
          <strong className="text-[var(--color-ink)]">{drift.silent_share_pct}%</strong> of those
          incidents shipped while the server&apos;s declared version did not change. The
          aggregates are frozen and citable as the{' '}
          <Link
            href="/drift-report"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            drift report, edition v1
          </Link>{' '}
          (DOI {edition.doi}); every underlying incident is in the{' '}
          <Link
            href="/ledger"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            public ledger
          </Link>
          .
        </p>
      </section>

      <section className="mt-14" aria-labelledby="mcp2-heading">
        <h2 id="mcp2-heading" className="t-h3 font-medium text-[var(--color-ink)]">
          The 2026-07-28 revision - the one called MCP 2.0
        </h2>
        <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-cite)]">
          The spec is versioned by date, so there is officially no &quot;MCP 2.0&quot; - but in
          practice the name means the 2026-07-28 revision: stateless core, per-request metadata
          instead of the initialize handshake, extensions. How many servers actually speak it is
          a question nobody publishes a measured answer to, including us, yet. Since{' '}
          {MCP2_PANEL.since} a daily panel has probed registry endpoints and recorded which era
          each one speaks. Enrollment is in its first weeks ({MCP2_PANEL.endpoints} endpoints as
          of {MCP2_PANEL.asOf}), so the adoption rate is deliberately withheld until coverage is
          a defensible share of the{' '}
          {withRemote.toLocaleString()} remote-declaring servers. It will publish on this page,
          with the denominator attached.
        </p>
        <p className="mt-4 text-[15px] leading-[1.6] text-[var(--color-cite)]">
          Both mcpindex surfaces speak 2026-07-28: <code>mcpindex.ai/api/mcp</code> answers{' '}
          <code>server/discover</code> with per-request metadata, and the{' '}
          <code>mcp-server-mcpindex</code> npm package serves both eras from 0.4.0. What the
          revision changed, and the one-curl probe to check any server (ours included):{' '}
          <Link
            href="/guides/what-is-mcp-2-0"
            className="underline decoration-[var(--color-rule)] underline-offset-2 hover:decoration-current"
          >
            What is MCP 2.0?
          </Link>
        </p>
      </section>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Page revalidates every hour ·{' '}
        <Link href="/api/registry-count" className="hover:text-[var(--color-accent-strong)]">
          /api/registry-count
        </Link>
      </p>
      <Figure
        id="corpus-pipeline"
        twinVars={{ servers: countFormatted, categories: String(ALL_CATEGORIES.length) }}
      >
        {renderDiagram('corpus-pipeline', {
          servers: countFormatted,
          categories: String(ALL_CATEGORIES.length),
        })}
      </Figure>
    </article>
  );
}
