import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadDriftStats } from '@/lib/driftStats';
import { loadLedger, ledgerEnabled } from '@/lib/ledger';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Drift dashboard',
  description:
    'Opt-in drift telemetry and public-registry crawl coverage. Counts reflect opted-in installs and crawler observations only, not total adoption.',
};

export default async function DashboardPage() {
  if (!ledgerEnabled()) notFound();

  const [stats, ledger] = await Promise.all([loadDriftStats(), loadLedger()]);

  const adoptionRows: Array<{ label: string; value: number }> = stats
    ? [
        { label: 'Opted-in installs', value: stats.optedInInstalls },
        { label: 'Servers covered', value: stats.serversCovered },
        { label: 'Tool pins seen', value: stats.pins },
        { label: 'Contract drifts seen (telemetry)', value: stats.drifts },
        { label: 'Safety-relevant signals', value: stats.safetyRelevant },
      ]
    : [];

  const crawlerRows: Array<{ label: string; value: number }> = ledger
    ? [
        {
          label: 'Contract drifts observed (crawler)',
          value: ledger.stat.total_contract_drifts_observed,
        },
        {
          label: 'Tools observed drifting',
          value: ledger.stat.tools_observed_drifting,
        },
      ]
    : [];

  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Drift dashboard · opt-in telemetry + crawl
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          Adoption and coverage.
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          Telemetry is opt-in (default off). These counts reflect only opted-in installs plus the
          public-registry crawl, not all mcpindex users.
        </p>
      </header>

      <section className="mt-12">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
          Opt-in telemetry
        </h2>
        {stats ? (
          <dl className="mt-4 rule-t">
            {adoptionRows.map((s) => (
              <div key={s.label} className="rule-b row-2up-end py-5 px-2">
                <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">{s.label}</dt>
                <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
                  {s.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 font-mono text-[13px] text-[var(--color-cite)]">
            Adoption metrics unavailable right now.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
          Crawler ledger
        </h2>
        {ledger ? (
          <dl className="mt-4 rule-t">
            {crawlerRows.map((s) => (
              <div key={s.label} className="rule-b row-2up-end py-5 px-2">
                <dt className="font-mono text-[12.5px] text-[var(--color-cite)]">{s.label}</dt>
                <dd className="font-mono text-[16px] text-[var(--color-ink)] tabular-nums text-right">
                  {s.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-4 font-mono text-[13px] text-[var(--color-cite)]">
            Crawler ledger unavailable right now.
          </p>
        )}
      </section>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Page revalidates every hour
      </p>
    </article>
  );
}
