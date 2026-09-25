import type { Metadata } from 'next';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { ledgerEnabled, type FleetEvent } from '@/lib/ledger';
import { loadLedger } from '@/lib/ledgerServer';
import { DriftReport } from '@/components/DriftReport';
import { jsonLdSafe } from '@/lib/jsonLd';
import { fmtUtc } from '@/lib/dates';

// 300s, not 3600: a one-off Redis blip makes loadLedger() return null, and ISR would otherwise
// cache that "not published" empty state for the whole window. 5 min bounds how long a transient
// miss can show stale-empty on a public trust surface (the API route is force-dynamic, so it
// self-heals per-request; this keeps the page close behind it).
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: 'Drift ledger',
  description:
    'Contract changes observed by the mcpindex crawler between daily registry snapshots. A contract diff, not a safety verdict.',
  path: '/ledger',
});

function truncateFp(fp: string): string {
  return fp.length >= 12 ? `${fp.slice(0, 12)}...` : fp;
}

const TH =
  'rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]';
const TD_NUM = 'rule-b rule-r px-3 py-2 align-top font-mono text-[13px] text-[var(--color-cite)] tabular-nums';

// Ledger /3: one row per publisher-wide change. Rendered ABOVE the per-tool table and
// safety-relevant first, because a reader who stops at the first table must not miss a
// publisher that flipped a safety field across hundreds of servers.
function PublisherWideChanges({ fleets, maxRows }: { fleets: readonly FleetEvent[]; maxRows: number }) {
  const rows = [...fleets]
    .sort(
      (a, b) =>
        Number(b.safety_relevant) - Number(a.safety_relevant) ||
        b.day.localeCompare(a.day) ||
        b.tools - a.tools,
    )
    .slice(0, maxRows);
  return (
    <section className="mt-12">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Publisher-wide changes
      </h2>
      <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-mute)]">
        Each row is one publisher changing tools (or server context) of the same kind on at least 10
        of its servers in one UTC day, counted once. &ldquo;Of the same kind&rdquo; means the same
        change kinds, not necessarily the same field. Safety-relevant rows come first; their tool
        fingerprints are listed in{' '}
        <Link href="/api/v1/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          /api/v1/ledger
        </Link>
        .
      </p>
      <div className="mt-6 site-table-wrap rule-t rule-b rule-l rule-r">
        <table className="w-full border-collapse text-left text-[13px]">
          <caption className="sr-only">
            Publisher-wide changes: publisher fingerprint, UTC day, what changed, how many servers and
            tools, and whether the change touched a safety-relevant field.
          </caption>
          <thead className="bg-[#fafaf9]">
            <tr>
              <th scope="col" className={TH}>Publisher fingerprint</th>
              <th scope="col" className={TH}>Day</th>
              <th scope="col" className={TH}>What changed</th>
              <th scope="col" className={TH}>Servers</th>
              <th scope="col" className={TH}>Tools</th>
              <th scope="col" className={TH}>Safety</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={`${f.publisher_fp}:${f.day}:${f.plane}:${i}`}>
                <td className={TD_NUM}>{truncateFp(f.publisher_fp)}</td>
                <td className={TD_NUM}>{f.day}</td>
                <td className="rule-b rule-r px-3 py-2 align-top text-[13px] text-[var(--color-cite)]">
                  <div className="flex flex-wrap gap-1">
                    {f.plane === 'context' && (
                      <span className="inline-block font-mono text-[10.5px] tracking-[0.04em] px-2 py-0.5 border border-[var(--color-accent)] text-[var(--color-ink)]">
                        server context
                      </span>
                    )}
                    {f.change_kinds.map((k) => (
                      <span
                        key={k}
                        className="inline-block font-mono text-[10.5px] tracking-[0.04em] px-2 py-0.5 border border-[var(--color-mute)] text-[var(--color-cite)]"
                      >
                        {k}
                      </span>
                    ))}
                  </div>
                </td>
                <td className={TD_NUM}>{f.servers.toLocaleString()}</td>
                <td className={TD_NUM}>{f.plane === 'context' ? '-' : f.tools.toLocaleString()}</td>
                <td className="rule-b rule-r px-3 py-2 align-top text-[13px] text-[var(--color-cite)]">
                  {f.safety_relevant ? (
                    <span className="inline-block font-mono text-[10.5px] uppercase tracking-[0.08em] px-2 py-0.5 border border-[var(--color-cite)] text-[var(--color-cite)]">
                      safety-relevant diff
                    </span>
                  ) : (
                    <>
                      <span className="sr-only">Not safety-relevant</span>
                      <span aria-hidden="true" className="text-[var(--color-mute)]">-</span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fleets.length > maxRows && (
        <p className="mt-4 text-[13px] leading-[1.55] text-[var(--color-mute)]">
          Showing {maxRows} of {fleets.length.toLocaleString()} publisher-wide changes.
        </p>
      )}
    </section>
  );
}


export default async function LedgerPage() {
  if (!ledgerEnabled()) notFound();

  const ledger = await loadLedger();

  if (!ledger) {
    return (
      <article className="site-container pt-16 pb-24">
        <header>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Drift ledger · contract changes observed
          </div>
          <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Drift ledger</h1>
        </header>
        <p className="mt-8 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          No ledger published right now - check back shortly.
        </p>
        <Figure id="drift-network-loop">{renderDiagram('drift-network-loop')}</Figure>
    </article>
    );
  }

  const { stat, events } = ledger;
  // Ledger /3 only: figures outside publisher-wide changes, and the changes themselves. Both are
  // absent on a /2 blob, and every block below renders exactly its /2 markup when they are.
  const ind = stat.independent;
  // Keyed on the SCHEMA, not on whether any fleet rows survived: under /3 the per-tool tables
  // omit fleet-only tools whether or not a publisher-wide change is listed.
  const isV3 = ledger.fleet_events !== undefined;
  const fleets = ledger.fleet_events ?? [];
  // Tools counted both above and inside a publisher-wide change (they also changed on their own).
  const overlap = ind
    ? Math.max(0, ind.tools_observed_drifting + ind.fleet_tools - stat.tools_observed_drifting)
    : 0;

  // Cap the rendered table: ~3.7k rows was ~38k DOM nodes / ~9MB of HTML, which taxes
  // low-end and mobile devices. The full corpus stays honest via the aggregate stats
  // above and the machine-readable /api/v1/ledger; the table shows the most-recently
  // observed changes (the useful view), newest first.
  const MAX_ROWS = 300;
  const truncated = events.length > MAX_ROWS;
  const rows = truncated
    ? [...events].sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? '')).slice(0, MAX_ROWS)
    : events;

  // Static Dataset markup (no blob-derived fields -> no </script> injection surface).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'mcpindex drift ledger',
    description:
      "Contract changes mcpindex's crawler observed in public MCP tool definitions between daily " +
      'registry snapshots. A contract diff, not a safety verdict.',
    url: 'https://mcpindex.ai/ledger',
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
          Drift ledger · contract changes observed
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Drift ledger</h1>
        <p className="mt-4 text-[15px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          Public proof of the problem the gate solves. mcpindex crawls the public MCP registry
          every day and records which tool contracts silently change. This is that record - the same
          corroborated drift the gate asks the network about when you pin a tool, so it
          can warn you on the first call. A contract-diff, not a safety verdict, and not
          prevention; the gate is what HOLDs the call. The deduped, citable analysis of this
          corpus is{' '}
          <Link href="/drift-report" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            The MCP Drift Report
          </Link>
          .
        </p>
      </header>

      <section className="mt-12 rule-t">
        <div className="rule-b py-8 px-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
            Observed
          </div>
          {ind ? (
            <>
              <p className="mt-2 font-mono text-[32px] leading-none text-[var(--color-ink)] tabular-nums">
                {ind.tools_observed_drifting.toLocaleString()} tools changed a contract field we
                publish, outside publisher-wide changes
              </p>
              {/* A publisher-wide change is one publisher changing tools of the same kind on at
                  least 10 of its servers in one UTC day (drain: fleet_partition). Counting each
                  of those tools separately made one operator's single deploy most of the
                  headline (72,212 of 97,506 on 2026-09-25), so it is counted once here and the
                  every-tool total stays beside it. */}
              <p className="mt-2 font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                {`${ind.fleet_changes.toLocaleString()} publisher-wide tool change${ind.fleet_changes === 1 ? '' : 's'}`},
                each one publisher changing tools of the same kind on at least 10 of its servers in one
                day, touched{' '}
                {ind.fleet_tools.toLocaleString()} tools
                {overlap > 0 ? `, ${overlap.toLocaleString()} of which also changed on their own` : ''}.
                Counting every tool, {stat.tools_observed_drifting.toLocaleString()} of{' '}
                {stat.total_contract_drifts_observed.toLocaleString()} tools observed drifting changed
                a field we publish; the remainder changed in ways we record but do not publish,
                predominantly description-only edits.
              </p>
            </>
          ) : (
          <>
          <p className="mt-2 font-mono text-[32px] leading-none text-[var(--color-ink)] tabular-nums">
            {stat.tools_observed_drifting.toLocaleString()} tools changed a contract field we
            publish
          </p>
          {/*
            These two numbers are a FRACTION, not a product. `total_contract_drifts_observed` is
            len({tool_fp ...}) over every crawl-observed drift INCLUDING the description-only ones
            the surfacing filter drops (drift_corpus_drain.py:1335-1339), and
            `tools_observed_drifting` is the count of surfaced tools (len(events) on a /2 blob; on /3
            events omit tools whose only change was publisher-wide) - the contract-affecting subset of
            that same set (:750). The drain's own comment states the intent: "N (surfaced) of M
            (all observed)".

            This block previously read "N tools changed their contract across M contract changes
            observed (a tool can change more than once)", which read M as a count of CHANGES. It is
            not, and the error was load-bearing: it is why the per-ChangeKind buckets below never
            reconciled to M and never could.
          */}
          <p className="mt-2 font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
            of {stat.total_contract_drifts_observed.toLocaleString()} tools observed drifting. The
            remainder changed in ways we record but do not publish, predominantly description-only
            edits.
          </p>
          </>
          )}
        </div>

        <dl>
          <div className="rule-b row-2up-end py-5 px-2">
            <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">
              Servers affected
              {ind && (
                <span className="block mt-1 font-mono text-[11px] text-[var(--color-mute)] normal-case">
                  Outside publisher-wide changes; {stat.servers.toLocaleString()} counting every server.
                </span>
              )}
            </dt>
            <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
              {(ind ? ind.servers : stat.servers).toLocaleString()}
            </dd>
          </div>
          <div className="rule-b row-2up-end py-5 px-2">
            <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">
              Safety-relevant contract changes
              <span className="block mt-1 font-mono text-[11px] text-[var(--color-mute)] normal-case">
                Changes that touch a safety-relevant field - not confirmed vulnerabilities.
                {ind &&
                  ` Outside publisher-wide changes; ${stat.safety_relevant.toLocaleString()} counting every tool.`}
              </span>
            </dt>
            <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
              {(ind ? ind.safety_relevant : stat.safety_relevant).toLocaleString()}
            </dd>
          </div>
        </dl>
      </section>

      <DriftReport ledger={ledger} />

      <section className="mt-12">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          Honesty
        </h2>
        <div className="mt-4 space-y-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          <p>
            These are contract changes mcpindex&apos;s crawler OBSERVED between two daily registry
            snapshots - a contract diff, not a safety verdict, and not an in-path prevention (that is
            the gate).
          </p>
          <p>
            Absence from this list is not a clean bill of health: a private or un-crawled tool never
            appears here.
          </p>
          <p>No server pays to be listed or de-listed.</p>
        </div>
        {/* The blob also carries a `framing` string, but it is operator/attacker-controllable;
            this page states its own framing above (hardcoded) rather than render blob prose. */}
        {ledger.generated_at && fmtUtc(ledger.generated_at) && (
          <p className="mt-2 font-mono text-[11px] text-[var(--color-mute)] tabular-nums">
            Generated {fmtUtc(ledger.generated_at)}
          </p>
        )}
      </section>

      {fleets.length > 0 && <PublisherWideChanges fleets={fleets} maxRows={MAX_ROWS} />}

      <section className="mt-12">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          Events
        </h2>
        <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-mute)]">
          Tools and servers are shown as fingerprints: keyed hashes of their public registry names
          under a published key. Anyone can recompute them, so they identify a server without
          printing its name; they are not a privacy measure. A dash means no server fingerprint
          was recorded.
          {isV3 && (
            <>
              {' '}
              A tool whose only change was part of a publisher-wide change is counted in that change
              above and not listed here; the gate&apos;s drift check still answers for it at{' '}
              <code className="font-mono text-[13px]">/api/v1/drift/any?fp=</code>.
            </>
          )}
        </p>
        {events.length === 0 ? (
          <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
            No contract drifts observed in the current window.
          </p>
        ) : (
          <div className="mt-6 site-table-wrap rule-t rule-b rule-l rule-r">
            <table className="w-full border-collapse text-left text-[13px]">
              <caption className="sr-only">
                Contract changes the crawler observed, by tool and server fingerprint, with last-seen
                time, what changed (the contract-diff kind), and whether the change touched a
                safety-relevant field.
              </caption>
              <thead className="bg-[#fafaf9]">
                <tr>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Tool fingerprint
                  </th>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Server fingerprint
                  </th>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Last seen
                  </th>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    What changed
                  </th>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Safety
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={`${e.tool_fp}:${e.server_fp}:${e.last_seen}`}>
                    <td className="rule-b rule-r px-3 py-2 align-top font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                      {truncateFp(e.tool_fp)}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                      {e.server_fp ? (
                        truncateFp(e.server_fp)
                      ) : (
                        <>
                          <span className="sr-only">No server fingerprint recorded</span>
                          <span aria-hidden="true">-</span>
                        </>
                      )}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                      {fmtUtc(e.last_seen)}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top text-[13px] text-[var(--color-cite)]">
                      {e.change_kinds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {e.change_kinds.map((k) => (
                            <span
                              key={k}
                              className="inline-block font-mono text-[10.5px] tracking-[0.04em] px-2 py-0.5 border border-[var(--color-mute)] text-[var(--color-cite)]"
                            >
                              {k === 'tool-removed' && e.removal_scope === 'toolset-replaced'
                                ? 'tool-removed (toolset replaced)'
                                : k}
                            </span>
                          ))}
                          {e.version_delta && e.version_delta !== 'not-recorded' && (
                            <span className="inline-block font-mono text-[10.5px] tracking-[0.04em] px-2 py-0.5 border border-[var(--color-accent)] text-[var(--color-ink)]">
                              {e.version_delta === 'same'
                                ? 'silent (version unchanged)'
                                : e.version_delta === 'changed'
                                  ? 'version changed'
                                  : 'no version declared'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          <span className="sr-only">No specific change kind recorded</span>
                          <span aria-hidden="true" className="text-[var(--color-mute)]">-</span>
                        </>
                      )}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top text-[13px] text-[var(--color-cite)]">
                      {e.safety_relevant ? (
                        <span className="inline-block font-mono text-[10.5px] uppercase tracking-[0.08em] px-2 py-0.5 border border-[var(--color-cite)] text-[var(--color-cite)]">
                          safety-relevant diff
                        </span>
                      ) : (
                        <>
                          <span className="sr-only">Not safety-relevant</span>
                          <span aria-hidden="true" className="text-[var(--color-mute)]">-</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {truncated && (
          <p className="mt-4 text-[13px] leading-[1.55] text-[var(--color-mute)]">
            Showing the {MAX_ROWS} most recently-observed of{' '}
            {events.length.toLocaleString()} contract changes
            {isV3 ? ' outside publisher-wide changes' : ''}. The complete, machine-readable
            ledger is at{' '}
            <Link href="/api/v1/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
              /api/v1/ledger
            </Link>
            .
          </p>
        )}
      </section>

      {/* Server-scoped context-surface drift, out-of-band from the tool events above: this is
          text a server supplies for clients to inject into agent context on connect
          (instructions / prompt metadata). No tool fingerprint exists for these by design.
          Rendered only when the drain has published any - an older blob simply has none. */}
      {ledger.context_events.length > 0 && (
        <section className="mt-12">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
            Context surface changes
          </h2>
          <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-mute)]">
            Server-scoped changes to injected context - instructions or prompt metadata a client
            auto-injects into an agent&apos;s context on connect. These sit outside every tool
            contract hash, so this observation is their only drift signal. The published kinds
            are the safety-relevant subset of the context taxonomy.
            {isV3 && (
              <>
                {' '}
                A server whose only context change was part of a publisher-wide change is counted in
                that change above and not listed here
                {ind
                  ? ` (${ind.context_fleet_surfaces.toLocaleString()} surface${ind.context_fleet_surfaces === 1 ? '' : 's'} across ${ind.context_fleet_changes.toLocaleString()} publisher-wide context change${ind.context_fleet_changes === 1 ? '' : 's'})`
                  : ''}.
              </>
            )}
          </p>
          <div className="mt-6 site-table-wrap rule-t rule-b rule-l rule-r">
            <table className="w-full border-collapse text-left text-[13px]">
              <caption className="sr-only">
                Context-surface changes the crawler observed, by server fingerprint, with last-seen
                time and what changed.
              </caption>
              <thead className="bg-[#fafaf9]">
                <tr>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Server fingerprint
                  </th>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Last seen
                  </th>
                  <th scope="col" className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    What changed
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Same DOM-size cap AND the same defensive sort as the tool table: the drain
                    sorts last_seen desc, but the blob is not trusted to - the truncation copy
                    below promises "most recently-observed", so enforce it here. */}
                {[...ledger.context_events]
                  .sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? ''))
                  .slice(0, MAX_ROWS)
                  .map((e, i) => (
                  // Index tiebreaker: the drain groups one row per server, but the blob is not
                  // trusted to - two rows for one server in one hour must not collide on key.
                  <tr key={`${e.server_fp}:${e.last_seen}:${i}`}>
                    <td className="rule-b rule-r px-3 py-2 align-top font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                      {truncateFp(e.server_fp)}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                      {fmtUtc(e.last_seen)}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top text-[13px] text-[var(--color-cite)]">
                      <div className="flex flex-wrap gap-1">
                        {e.change_kinds.map((k) => (
                          <span
                            key={k}
                            className="inline-block font-mono text-[10.5px] tracking-[0.04em] px-2 py-0.5 border border-[var(--color-mute)] text-[var(--color-cite)]"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ledger.context_events.length > MAX_ROWS && (
            <p className="mt-4 text-[13px] leading-[1.55] text-[var(--color-mute)]">
              Showing the {MAX_ROWS} most recently-observed of{' '}
              {ledger.context_events.length.toLocaleString()} context-surface changes; the full
              list is in{' '}
              <Link href="/api/v1/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
                /api/v1/ledger
              </Link>
              .
            </p>
          )}
        </section>
      )}

      {/* The loop that produces every row above. This is the POPULATED path; the figure also
          renders in the empty-ledger fallback, where it is the only thing explaining what the
          page would show. Placing it in the fallback ALONE was the defect: production always
          has a ledger, so that branch never runs and the figure never appeared here at all. */}
      <Figure id="drift-network-loop">{renderDiagram('drift-network-loop')}</Figure>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Page refreshed every 5 minutes; the crawler runs daily
      </p>
      <p className="mt-2 font-mono text-[11px] leading-[1.6] text-[var(--color-mute)] normal-case tracking-normal">
        As of 2026-07-19 the ledger also counts tool removals; earlier totals exclude them. Most
        removals arrive as full toolset replacements, not single-tool deletions. Removal entries
        are historical observations - a same-named tool may have since returned. Details on{' '}
        <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          /methodology
        </Link>
        .
      </p>
    </article>
  );
}
