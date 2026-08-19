import type { Metadata } from 'next';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { ledgerEnabled } from '@/lib/ledger';
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
          <p className="mt-2 font-mono text-[32px] leading-none text-[var(--color-ink)] tabular-nums">
            {stat.tools_observed_drifting.toLocaleString()} tools changed a contract field we
            publish
          </p>
          {/*
            These two numbers are a FRACTION, not a product. `total_contract_drifts_observed` is
            len({tool_fp ...}) over every crawl-observed drift INCLUDING the description-only ones
            the surfacing filter drops (drift_corpus_drain.py:1335-1339), and
            `tools_observed_drifting` is len(events) - the surfaced, contract-affecting subset of
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
        </div>

        <dl>
          <div className="rule-b row-2up-end py-5 px-2">
            <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">Servers affected</dt>
            <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
              {stat.servers.toLocaleString()}
            </dd>
          </div>
          <div className="rule-b row-2up-end py-5 px-2">
            <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">
              Safety-relevant contract changes
              <span className="block mt-1 font-mono text-[11px] text-[var(--color-mute)] normal-case">
                Changes that touch a safety-relevant field - not confirmed vulnerabilities.
              </span>
            </dt>
            <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
              {stat.safety_relevant.toLocaleString()}
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

      <section className="mt-12">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          Events
        </h2>
        <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-mute)]">
          Tools and servers are shown as content fingerprints, not names: mcpindex reports that a
          contract changed without publicly naming a specific server. A dash means no server
          fingerprint was recorded.
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
            {events.length.toLocaleString()} contract changes. The complete, machine-readable
            ledger is at{' '}
            <Link href="/api/v1/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
              /api/v1/ledger
            </Link>
            .
          </p>
        )}
      </section>

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
