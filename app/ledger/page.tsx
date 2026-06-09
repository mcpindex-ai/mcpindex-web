import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadLedger, ledgerEnabled } from '@/lib/ledger';

// 300s, not 3600: a one-off Redis blip makes loadLedger() return null, and ISR would otherwise
// cache that "not published" empty state for the whole window. 5 min bounds how long a transient
// miss can show stale-empty on a public trust surface (the API route is force-dynamic, so it
// self-heals per-request; this keeps the page close behind it).
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Drift ledger',
  description:
    'Contract changes observed by the mcpindex crawler between daily registry snapshots. A contract diff, not a safety verdict.',
};

function truncateFp(fp: string): string {
  return fp.length >= 12 ? `${fp.slice(0, 12)}...` : fp;
}

// The blob carries hour-coarsened ISO timestamps (YYYY-MM-DDTHH:00:00Z). Show a human UTC string
// to match the site's date voice (stats/status). A non-date value renders nothing (not the raw
// string) so an operator/attacker-controlled blob can never paint arbitrary text on a date line.
function fmtTs(ts: string): string {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
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
        {ledger.generated_at && fmtTs(ledger.generated_at) && (
          <p className="mt-2 font-mono text-[11px] text-[var(--color-mute)] tabular-nums">
            Generated {fmtTs(ledger.generated_at)}
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
                time and whether the change touched a safety-relevant field.
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
                      {fmtTs(e.last_seen)}
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
        Page revalidates every 5 minutes
      </p>
    </article>
  );
}
