import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ledgerEnabled } from '@/lib/ledger';
import { loadLedger } from '@/lib/ledgerServer';
import { jsonLdSafe } from '@/lib/jsonLd';
import { fmtUtc } from '@/lib/dates';

// 300s, not 3600: a one-off Redis blip makes loadLedger() return null, and ISR would otherwise
// cache that "not published" empty state for the whole window. 5 min bounds how long a transient
// miss can show stale-empty on a public trust surface (the API route is force-dynamic, so it
// self-heals per-request; this keeps the page close behind it).
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Drift ledger',
  description:
    'Contract changes observed by the mcpindex crawler between daily registry snapshots. A contract diff, not a safety verdict.',
  alternates: { canonical: 'https://mcpindex.ai/ledger' },
};

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
      </article>
    );
  }

  const { stat, events } = ledger;

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
          every day and records which tool contracts silently change. This is that record &mdash;
          the same corroborated drift the gate asks the network about when you pin a tool, so it
          can warn you on the first call. A contract-diff, not a safety verdict, and not
          prevention; the gate is what HOLDs the call.
        </p>
      </header>

      <section className="mt-12 rule-t">
        <div className="rule-b py-8 px-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
            Observed
          </div>
          <p className="mt-2 font-mono text-[32px] leading-none text-[var(--color-ink)] tabular-nums">
            {stat.tools_observed_drifting.toLocaleString()} tools changed their contract
          </p>
          <p className="mt-2 font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
            across {stat.total_contract_drifts_observed.toLocaleString()} contract changes observed
            (a tool can change more than once)
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
                {events.map((e) => (
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
                              {k}
                            </span>
                          ))}
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
      </section>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Page refreshed every 5 minutes; the crawler runs daily
      </p>
    </article>
  );
}
