import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadLedger, ledgerEnabled } from '@/lib/ledger';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Drift ledger',
  description:
    'Contract changes observed by the mcpindex crawler between daily registry snapshots. A contract diff, not a safety verdict.',
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
          No ledger published right now -- check back shortly.
        </p>
      </article>
    );
  }

  const { stat, events } = ledger;

  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Drift ledger · contract changes observed
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Drift ledger</h1>
      </header>

      <section className="mt-12 rule-t">
        <div className="rule-b py-8 px-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
            Observed
          </div>
          <p className="mt-2 font-mono text-[32px] leading-none text-[var(--color-ink)] tabular-nums">
            {stat.tools_observed_drifting.toLocaleString()} tools observed drifting
          </p>
          <p className="mt-2 font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
            of {stat.total_contract_drifts_observed.toLocaleString()} contract changes observed
          </p>
        </div>

        <div className="rule-b row-2up-end py-5 px-2">
          <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">Servers affected</dt>
          <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
            {stat.servers.toLocaleString()}
          </dd>
        </div>
        <div className="rule-b row-2up-end py-5 px-2">
          <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">Safety-relevant changes</dt>
          <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
            {stat.safety_relevant.toLocaleString()}
          </dd>
        </div>
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
        {ledger.framing && (
          <p className="mt-6 text-[14px] leading-[1.55] text-[var(--color-mute)]">{ledger.framing}</p>
        )}
        {ledger.generated_at && (
          <p className="mt-2 font-mono text-[11px] text-[var(--color-mute)] tabular-nums">
            Generated {ledger.generated_at}
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          Events
        </h2>
        {events.length === 0 ? (
          <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
            No contract drifts observed in the current window.
          </p>
        ) : (
          <div className="mt-6 site-table-wrap rule-t rule-b rule-l rule-r">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-[#fafaf9]">
                <tr>
                  <th className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Tool fingerprint
                  </th>
                  <th className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Server fingerprint
                  </th>
                  <th className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    Last seen
                  </th>
                  <th className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
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
                      {e.server_fp ? truncateFp(e.server_fp) : '-'}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top font-mono text-[13px] text-[var(--color-cite)] tabular-nums">
                      {e.last_seen}
                    </td>
                    <td className="rule-b rule-r px-3 py-2 align-top text-[13px] text-[var(--color-cite)]">
                      {e.safety_relevant ? (
                        <span className="inline-block font-mono text-[10.5px] uppercase tracking-[0.08em] px-2 py-0.5 border border-[var(--color-rule)] text-[var(--color-accent)]">
                          safety-relevant
                        </span>
                      ) : (
                        <span className="text-[var(--color-mute)]">-</span>
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
        Page revalidates every hour
      </p>
    </article>
  );
}
