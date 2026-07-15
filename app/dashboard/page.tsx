import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ledgerEnabled } from '@/lib/ledger';
import { loadDriftStats } from '@/lib/driftStatsServer';
import { loadLedger } from '@/lib/ledgerServer';

// 300s (see app/ledger/page.tsx): bounds how long a transient Redis-null empty state can be
// ISR-cached on a public surface.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Drift dashboard',
  description:
    'Opt-in drift telemetry and public-registry crawl coverage. Counts reflect opted-in installs and crawler observations only, not total adoption.',
  alternates: { canonical: 'https://mcpindex.ai/dashboard' },
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
        { label: 'Safety-relevant contract changes', value: stats.safetyRelevant },
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
        <p className="mt-3 text-[14px] leading-[1.55] text-[var(--color-mute)]">
          Coverage is not endorsement: a server absent here is un-crawled or opted-out, not vouched
          for - and listing is never bought.
        </p>
        <p className="mt-3 text-[14px] leading-[1.55] text-[var(--color-mute)]">
          Why it matters: every server the crawler covers, and every install that opts in, is a tool
          the gate can warn you about on call 1 - coverage is the network growing. What opt-in
          telemetry sends is on{' '}
          <a href="/privacy" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">privacy</a>.
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
            Adoption metrics aren&apos;t published right now - check back shortly.
          </p>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
          Crawler ledger
        </h2>
        <p className="mt-2 text-[13px] leading-[1.5] text-[var(--color-mute)]">
          A different population than the opt-in telemetry above: these come from the public-registry
          crawl, so the counts will not match the telemetry numbers.
        </p>
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
            Crawler ledger isn&apos;t published right now - check back shortly.
          </p>
        )}
      </section>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Refreshed every 5 minutes
      </p>
    </article>
  );
}
