import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageMetadata } from '@/lib/seo';
import { driftReportEnabled, parseReportStatsBlob, REPORT_STATS_SCHEMA } from '@/lib/reportStats';
import type { ReportStats } from '@/lib/reportStats';
import { ledgerEnabled } from '@/lib/ledger';
import { loadReportStats } from '@/lib/reportStatsServer';
import { kindLabel } from '@/lib/kindLabels';
import { jsonLdSafe } from '@/lib/jsonLd';
import { DriftReportCta } from '@/components/DriftReportCta';
import { ObfuscatedEmail } from '@/components/ObfuscatedEmail';
import edition from '@/data/report-edition-v1.json';

// The MCP Drift Report (build plan #11): the citable full-findings page. Aggregates only -
// fingerprint-anonymized corpus, no server names anywhere on this page. Frozen Edition header
// (matches the DOI snapshot exactly) + live auto-derived counters, visually separated and
// labeled "live since Edition v1", so the live surface can never contradict the citation.
//
// GATED (spec Section 5 leak guard): 404s unless NEXT_PUBLIC_DRIFT_REPORT === '1' AND the
// ledger flag is on. This page and its strings live on the p1-evidence-frame branch only
// until the name/DOI ratification deploy unit ships.

// 300s, matching /ledger: bounds how long a transient Redis miss can show the frozen-only
// fallback on a public trust surface.
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: 'The MCP Drift Report',
  description:
    'How MCP tool contracts change in the wild: deduped safety incidents by kind, how many land with the declared version unchanged, removals, unstable contracts, and the full methodology. Fingerprinted corpus, checkable numbers.',
  path: '/drift-report',
});

// The frozen edition, run through the SAME coercion path as the live blob so both sides of the
// page render from one validated shape (and the checked-in JSON can never drift structurally).
function frozenStats(): ReportStats {
  const parsed = parseReportStatsBlob({
    schema: REPORT_STATS_SCHEMA,
    generated_at: '',
    aggregates: edition.aggregates,
    coverage: edition.coverage,
    removals: edition.removals,
    unstable: edition.unstable,
    headline_excluding_unstable: edition.headline_excluding_unstable,
  });
  if (!parsed) throw new Error('data/report-edition-v1.json failed report-stats coercion');
  return parsed;
}

function pctOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

function day(ts: string): string {
  return ts.length >= 10 ? ts.slice(0, 10) : ts;
}

// The DOI line renders ONLY once a real DOI replaces the placeholder at publication.
function isRealDoi(v: string): boolean {
  return /^10\.\d{4,9}\/\S+$/.test(v);
}

const STAT_LABEL = 'font-mono text-[12.5px] text-[var(--color-cite)]';
const STAT_VALUE =
  'font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right';
const SECTION_H =
  'font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]';

export default async function DriftReportPage() {
  if (!driftReportEnabled() || !ledgerEnabled()) notFound();

  const frozen = frozenStats();
  const live = await loadReportStats();
  const data = live ?? frozen;
  const isLive = live !== null;

  const agg = data.aggregates;
  const split = agg.version_delta_split;
  const headline = data.headline_excluding_unstable;
  const gap = data.coverage.gap_spans[0];

  const flipRows = Object.entries(agg.flip_segmentation);
  const flipTotal = flipRows.reduce((s, [, n]) => s + n, 0);
  const firstLabeling = flipRows
    .filter(([k]) => k.startsWith('first-labeling|'))
    .reduce((s, [, n]) => s + n, 0);
  const guaranteeChange = flipTotal - firstLabeling;

  const removals = data.removals;
  const replacedShare = pctOf(
    removals.removal_scope_split['toolset-replaced'],
    removals.deduped_removal_fp_count,
  );

  const kinds = Object.entries(agg.incidents_by_kind).sort(([, a], [, b]) => b - a);

  // Static Dataset markup (no blob-derived fields -> no </script> injection surface).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'The MCP Drift Report',
    description:
      'Deduped, re-verified tool-contract change incidents mcpindex observed across the public ' +
      'MCP registry, with version behavior, removal scope, and stability segmentation. A ' +
      'contract diff, not a safety verdict.',
    url: 'https://mcpindex.ai/drift-report',
    creator: { '@type': 'Organization', name: 'mcpindex', url: 'https://mcpindex.ai' },
    license: 'https://creativecommons.org/licenses/by/4.0/',
    isAccessibleForFree: true,
  };

  return (
    <article className="site-container pt-16 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />

      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          The Drift Report · full findings
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          How MCP tool contracts change in the wild
        </h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          mcpindex snapshots the public MCP registry&apos;s reachable remote servers and diffs
          every tool contract between snapshots. This report is the deduped, re-verified record
          of what changed: what kind of change, whether the server&apos;s declared version moved
          with it, and how often removal means replacement. A contract diff, not a safety
          verdict. Every number below is computed from the corpus, and every tool is a salted
          fingerprint - this page names no server.
        </p>
      </header>

      {/* ---- Edition v1: the frozen, citable header. Numbers match the DOI snapshot exactly. */}
      <section
        aria-labelledby="edition-heading"
        className="mt-12 border border-[var(--color-ink)] p-6"
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2
            id="edition-heading"
            className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-ink)]"
          >
            Edition v1 · frozen {edition.frozen_at}
          </h2>
          {isRealDoi(edition.doi) && (
            <span className="font-mono text-[12px] text-[var(--color-cite)]">
              DOI: {edition.doi}
            </span>
          )}
        </div>
        <p className="mt-2 text-[13px] leading-[1.55] text-[var(--color-mute)] max-w-2xl">
          These headline numbers are frozen as of {edition.frozen_at} and are the citable
          edition of this report. The live counters further down update with each crawl and are
          labeled separately, so a citation of this edition stays checkable against exactly
          these figures.
        </p>
        <dl className="mt-5 rule-t">
          <div className="rule-b row-2up-end py-4 px-2">
            <dt className={STAT_LABEL}>Deduped safety-relevant incidents</dt>
            <dd className={STAT_VALUE}>
              {edition.aggregates.deduped_safety_incidents.toLocaleString()}
            </dd>
          </div>
          <div className="rule-b row-2up-end py-4 px-2">
            <dt className={STAT_LABEL}>
              Landed with the declared version unchanged
              <span className="block mt-1 font-mono text-[11px] text-[var(--color-mute)] normal-case">
                Basis: {edition.silent_share_basis}.
              </span>
            </dt>
            <dd className={STAT_VALUE}>{edition.aggregates.silent_share_pct}%</dd>
          </div>
          <div className="rule-b row-2up-end py-4 px-2">
            <dt className={STAT_LABEL}>Tools removed (deduped)</dt>
            <dd className={STAT_VALUE}>
              {edition.removals.deduped_removal_fp_count.toLocaleString()}
            </dd>
          </div>
          <div className="rule-b row-2up-end py-4 px-2">
            <dt className={STAT_LABEL}>Tools serving unstable contracts</dt>
            <dd className={STAT_VALUE}>
              {edition.unstable.unstable_tool_count.toLocaleString()}
            </dd>
          </div>
          <div className="rule-b row-2up-end py-4 px-2">
            <dt className={STAT_LABEL}>Coverage</dt>
            <dd className={STAT_VALUE}>
              {edition.coverage.snapshot_count} snapshots across{' '}
              {edition.coverage.elapsed_days} days
            </dd>
          </div>
        </dl>
      </section>

      {/* ---- Live counters: visually separated from the frozen edition, labeled. */}
      <section aria-labelledby="live-heading" className="mt-12 rule-t pt-8">
        <h2 id="live-heading" className={SECTION_H}>
          Live since Edition v1
        </h2>
        {isLive ? (
          <p className="mt-3 text-[13px] leading-[1.55] text-[var(--color-mute)] max-w-2xl">
            Everything below is auto-derived from the crawl corpus on every pipeline run -
            never hand-copied - and has accrued since the frozen edition above.
            {data.generated_at && <> Last derived {day(data.generated_at)} (UTC).</>}
          </p>
        ) : (
          <p className="mt-3 text-[13px] leading-[1.55] text-[var(--color-mute)] max-w-2xl">
            Live counters are unavailable right now; the sections below show the frozen
            Edition v1 ({edition.frozen_at}) numbers until the next successful refresh.
          </p>
        )}

        {/* Incidents by kind */}
        <h3 className="mt-8 t-h3 font-medium text-[var(--color-ink)]">
          What changed: {agg.deduped_safety_incidents.toLocaleString()} deduped incidents by kind
        </h3>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          An incident is one (server, tool, change kind) triple, deduped across the whole window
          - the same tool changing the same way on five days counts once, with its occurrence
          span retained. Raw events observed: {agg.events_total.toLocaleString()}, of which{' '}
          {agg.safety_events.toLocaleString()} touched a safety-relevant contract field.
        </p>
        <div className="mt-5 site-table-wrap rule-t rule-b rule-l rule-r">
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">
              Deduped safety-relevant incidents by change kind.
            </caption>
            <thead className="bg-[#fafaf9]">
              <tr>
                <th scope="col" className="rule-b rule-r px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                  Change kind
                </th>
                <th scope="col" className="rule-b rule-r px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                  Incidents
                </th>
                <th scope="col" className="rule-b rule-r px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                  Share
                </th>
              </tr>
            </thead>
            <tbody>
              {kinds.map(([kind, count]) => (
                <tr key={kind}>
                  <td className="rule-b rule-r px-3 py-2 text-[13px] text-[var(--color-cite)]">
                    <span className="font-mono">{kind}</span>{' '}
                    <span className="text-[var(--color-mute)]">({kindLabel(kind)})</span>
                  </td>
                  <td className="rule-b rule-r px-3 py-2 font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                    {count.toLocaleString()}
                  </td>
                  <td className="rule-b rule-r px-3 py-2 font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                    {pctOf(count, agg.deduped_safety_incidents)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Silent share, basis named */}
        <h3 className="mt-10 t-h3 font-medium text-[var(--color-ink)]">
          Did the version move? The silent share, with its basis
        </h3>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          For each incident we join the server&apos;s declared version across the pair of
          snapshots where the change first appeared. The silent share - the share of incidents
          that landed with the declared version unchanged - is{' '}
          <strong className="text-[var(--color-ink)]">{agg.silent_share_pct}%</strong>. Basis:{' '}
          <em>deduped safety incidents, first-occurrence delta</em>. That basis matters: the
          /ledger lede counts per-tool version behavior over every observed transition, a
          different (also labeled) basis, so the two numbers are reconcilable rather than
          interchangeable.
        </p>
        <dl className="mt-5 rule-t max-w-2xl">
          {(
            [
              ['same', 'Version unchanged across the change'],
              ['changed', 'Version changed with the change'],
              ['undeclared', 'No version declared at either snapshot'],
            ] as const
          ).map(([cls, label]) => (
            <div key={cls} className="rule-b row-2up-end py-4 px-2">
              <dt className={STAT_LABEL}>{label}</dt>
              <dd className={STAT_VALUE}>
                {(split[cls] ?? 0).toLocaleString()} ·{' '}
                {pctOf(split[cls] ?? 0, agg.deduped_safety_incidents)}%
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[13px] leading-[1.55] text-[var(--color-mute)] max-w-2xl">
          &quot;Version changed&quot; means the declared version string differed across the pair
          - direction is never computed, so no claim about upgrades is made. A change arriving
          with an unchanged declared version is an observation about version behavior, not an
          accusation of intent.
        </p>

        {/* Flip segmentation */}
        <h3 className="mt-10 t-h3 font-medium text-[var(--color-ink)]">
          Annotation flips: first labels vs changed guarantees
        </h3>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          {flipTotal.toLocaleString()} incidents flipped a tool to destructive. They split two
          ways: <strong className="text-[var(--color-ink)]">{firstLabeling.toLocaleString()}</strong>{' '}
          were first-labelings - the old tool record carried no annotations block at all, so the
          flip is a server declaring safety hints for the first time, the ecosystem&apos;s
          labeling maturing - and{' '}
          <strong className="text-[var(--color-ink)]">{guaranteeChange.toLocaleString()}</strong>{' '}
          were guarantee changes, where an existing annotations block moved to destructive.
          First-labeling is the majority: most flips read as labels maturing, not guarantees
          changing. The segmentation below crosses each flip class with its version behavior.
        </p>
        <div className="mt-5 site-table-wrap rule-t rule-b rule-l rule-r max-w-2xl">
          <table className="w-full border-collapse text-left text-[13px]">
            <caption className="sr-only">
              Annotation-flip incidents by flip class and version behavior.
            </caption>
            <thead className="bg-[#fafaf9]">
              <tr>
                <th scope="col" className="rule-b rule-r px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                  Flip class · version behavior
                </th>
                <th scope="col" className="rule-b rule-r px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                  Incidents
                </th>
              </tr>
            </thead>
            <tbody>
              {flipRows
                .sort(([, a], [, b]) => b - a)
                .map(([key, count]) => (
                  <tr key={key}>
                    <td className="rule-b rule-r px-3 py-2 font-mono text-[13px] text-[var(--color-cite)]">
                      {key.replace('|', ' · version ')}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                      {count.toLocaleString()}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Removal split */}
        <h3 className="mt-10 t-h3 font-medium text-[var(--color-ink)]">
          Removals: mostly replacement, rarely deletion
        </h3>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          {removals.deduped_removal_fp_count.toLocaleString()} tools were removed (
          {removals.deduped_removal_event_count.toLocaleString()} removal events - a tool can be
          removed, return, and be removed again).{' '}
          <strong className="text-[var(--color-ink)]">
            {removals.removal_scope_split['toolset-replaced'].toLocaleString()} ({replacedShare}
            %)
          </strong>{' '}
          were part of a toolset replacement - the same server shed five or more tools in one
          snapshot pair, typically an API redesign - while{' '}
          {removals.removal_scope_split.single.toLocaleString()} were single-tool removals. The
          copy follows the data: replacement is the dominant reality; the rare single deletions
          are the events worth a second look. Removal entries are historical observations - a
          same-named tool may have since returned.
        </p>

        {/* Unstable class + headline-excluding view */}
        <h3 className="mt-10 t-h3 font-medium text-[var(--color-ink)]">
          Unstable contracts, counted apart
        </h3>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          <strong className="text-[var(--color-ink)]">
            {data.unstable.unstable_tool_count.toLocaleString()} tools
          </strong>{' '}
          serve unstable contracts ({data.unstable.unstable_incident_count.toLocaleString()}{' '}
          incidents, {data.unstable.excluded_event_share_pct}% of events): the contract changed
          on five or more distinct days, reverted to an earlier hash, or churned its hash while
          the schema stayed the same (dynamic metadata). Counting an oscillating contract as
          fresh drift every day would inflate the numbers, so the unstable class is excluded
          from the headline counts and reported here as its own finding. Excluding it, the
          deduped incident count is{' '}
          {headline.deduped_safety_incidents.toLocaleString()} and the share landing with the
          declared version unchanged rises to{' '}
          <strong className="text-[var(--color-ink)]">{headline.silent_share_pct}%</strong>{' '}
          (same basis as above) - the segmentation strengthens the headline rather than
          propping it up.
        </p>

        {/* Coverage honesty */}
        <h3 className="mt-10 t-h3 font-medium text-[var(--color-ink)]">Coverage, stated honestly</h3>
        <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          This corpus is{' '}
          <strong className="text-[var(--color-ink)]">
            {data.coverage.snapshot_count} snapshots across {data.coverage.elapsed_days} days
          </strong>{' '}
          ({day(data.coverage.first_snapshot)} to {day(data.coverage.last_snapshot)},{' '}
          {data.coverage.pair_count} adjacent pairs)
          {gap && gap.days > 0 && (
            <>
              , including a {gap.days}-day gap ({day(gap.after)} to {day(gap.before)}) when the
              crawler was down
            </>
          )}
          . It is not an unbroken daily series and we do not present it as one: incidents are
          deduped across the gap rather than papered over it, and changes that happened entirely
          inside the gap window were never observed.
        </p>
      </section>

      {/* ---- Methodology inline */}
      <section aria-labelledby="methodology-heading" className="mt-14 rule-t pt-8">
        <h2 id="methodology-heading" className={SECTION_H}>
          Methodology
        </h2>
        <ul className="mt-4 space-y-3 text-[14.5px] leading-[1.55] text-[var(--color-cite)] list-disc pl-5 max-w-2xl">
          <li>
            <strong className="text-[var(--color-ink)]">Population:</strong> roughly 2,090
            reachable remote servers of the indexed official registry. Indexed and crawled are
            different populations - a local-only or unreachable server never appears here, and
            absence from this report is not a clean bill of health.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Merge per name:</strong> registry
            entries sharing one name are merged to a single record before diffing (winner:
            reachable, then most tools; other endpoints retained as alternates), so two
            deployments contending for one name can never mint phantom drift against each
            other.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Flap guard:</strong> each snapshot pair
            is scoped to servers reachable in both snapshots before diffing, so a server
            flapping out of reachability never reads as mass tool removal.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Dedup:</strong> incidents are one
            (server, tool, change kind) triple with first-seen / last-seen / occurrence count.
            Version behavior is joined per incident from the snapshot pair where it first
            appeared, anchored on content hashes.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Unstable exclusion:</strong> five or
            more distinct change days, a hash revert, or a dynamic-metadata signature flags a
            tool unstable; the class is excluded from headline counts and reported separately
            above.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Anonymization:</strong> tools and
            servers are salted fingerprints on every public surface of this dataset. This page
            names no server; per-server context lives on the named server pages with their own
            fairness labels.
          </li>
        </ul>
        <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-cite)]">
          The full pipeline, taxonomy, and disclosure history:{' '}
          <Link
            href="/methodology"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            /methodology
          </Link>
          .
        </p>
      </section>

      {/* ---- Census appendix */}
      <section aria-labelledby="census-heading" className="mt-14 rule-t pt-8">
        <h2 id="census-heading" className={SECTION_H}>
          Appendix · the census behind these numbers
        </h2>
        <div className="mt-4 space-y-4 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          <p>
            Before publishing, we re-verified every event rather than sampling: a census of the
            55,443-event corpus, recounted independently of the pipeline that produced it. The
            change-kind classifier came back with{' '}
            <strong className="text-[var(--color-ink)]">0 misclassifications</strong> across the
            census, and no safety-relevant change was found missed.
          </p>
          <p>
            The census also found our own day-one artifacts: reachability flaps on the first
            crawl day had minted phantom tool-removal events. We excluded them by regenerating
            every report from the retained snapshots with the current merge and flap-guard
            methodology - the ground-truth snapshots are archived, so every number here is
            re-derivable - and only then pinned the edition figures above.
          </p>
          <p>
            Validation method, in short: independent recount of event totals per kind;
            hash-anchored adjacent-pair version joins checked for exactness against the pinned
            counts; and manual triage of every anomaly class (oscillating contracts, name
            collisions, flap artifacts) with each resolution disclosed in the methodology
            rather than silently absorbed - finding and excluding our own artifacts is the
            point of a census.
          </p>
        </div>
      </section>

      {/* ---- ICP-1: install CTA (own instrumented source) */}
      <DriftReportCta />

      {/* ---- ICP-2: platform teams + hand-raise */}
      <section aria-labelledby="platform-teams-heading" className="mt-12 rule-t pt-8">
        <h2 id="platform-teams-heading" className={SECTION_H}>
          For platform teams
        </h2>
        <p className="mt-4 text-[14.5px] leading-[1.6] text-[var(--color-cite)] max-w-2xl">
          mcpindex is a policy layer for MCP adoption. Pin every approved server&apos;s tool
          contracts at adoption time, so what your agents run is what you reviewed. The gate
          holds a call when a pinned contract changes underneath it - including changes that
          arrive with the declared version unchanged - until someone re-approves. The receipts
          page is the audit artifact: per-install evidence of what was held and why. All of it
          is a deterministic contract diff, never a safety verdict, and the{' '}
          <Link
            href="/methodology"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            methodology
          </Link>{' '}
          is public.
        </p>
        <p className="mt-5 text-[14.5px] leading-[1.55] text-[var(--color-ink)] max-w-2xl">
          Evaluating MCP trust for a team? Email{' '}
          <ObfuscatedEmail
            user="gb"
            domain="mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          />{' '}
          - early design partners get input on the roadmap.
        </p>
      </section>

      <p className="mt-12 text-[14px] leading-[1.6] text-[var(--color-mute)]">
        Companion dataset:{' '}
        <Link
          href="/research/source-liveness"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          Source Liveness
        </Link>{' '}
        - a census of which listed servers&apos; source is still publicly auditable
        (archived, DOI 10.5281/zenodo.21501868).
      </p>

      <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Page refreshed every 5 minutes · frozen edition numbers never change
      </p>
    </article>
  );
}
