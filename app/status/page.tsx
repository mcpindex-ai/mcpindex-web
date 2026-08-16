import Link from 'next/link';
import type { Metadata } from 'next';
import { loadSnapshotMeta, loadServers } from '@/lib/registry';
import { listScreened } from '@/lib/verdicts';
import { timeAgo } from '@/lib/time';

export const metadata: Metadata = {
  title: 'Status',
  description:
    'mcpindex system status: data freshness, coverage, sync cadence, checkable live endpoints, and incident log. Real figures, revalidated hourly; authoritative uptime is monitored externally.',
  alternates: { canonical: 'https://mcpindex.ai/status' },
};

// Revalidate hourly so the freshness figures stay live without rebuilding.
export const revalidate = 3600;

export default async function StatusPage() {
  const [snap, servers, screened] = await Promise.all([
    loadSnapshotMeta(),
    loadServers(),
    listScreened(),
  ]);

  // Only figures this page can actually compute. We deliberately do NOT assert
  // "all systems operational" - this is a static page revalidated hourly, so a
  // hardcoded green light could lie during a real outage. A trust product does
  // not get to do that. Authoritative liveness is the checkable endpoints
  // below plus the external monitor.
  const data: { k: string; v: string; note?: string }[] = [
    {
      k: 'Registry snapshot',
      v: timeAgo(snap.fetchedAt),
      // No clock time and no fixed interval here on purpose. This said "synced
      // daily at 06:00 UTC" while sync-registry.yml ran `0 */4 * * *` - six runs
      // a day, none of them at 06:00. The row above already publishes the real
      // age from the snapshot itself, so the note only has to name the source
      // and stay true across a schedule change.
      note: 'synced several times a day from the official MCP registry',
    },
    { k: 'Servers tracked', v: servers.length.toLocaleString() },
    {
      k: 'Verdicts on file',
      v: screened.length.toLocaleString(),
      note: 'coverage expands adversarial-first; see /methodology',
    },
  ];

  const endpoints: { path: string; note: string }[] = [
    { path: '/api/registry-count', note: 'live server count (JSON)' },
    { path: '/api/v1/trust/tool/<server_id>/<tool_name>', note: 'verdict API · free tier, no key' },
    { path: '/api/v1/screen', note: 'live screener (POST)' },
  ];

  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Status
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        System status.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        The figures below are real and revalidate hourly. Authoritative uptime
        is monitored externally on{' '}
        <a
          href="https://stats.uptimerobot.com/BmOwSpYXOj"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          an independent status page
        </a>{' '}
        that stays up when this site does not; the endpoints are public, so you
        can check liveness yourself rather than take a green light on faith.
        Failure behavior per surface is documented at{' '}
        <Link href="/reliability" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          /reliability
        </Link>
        .
      </p>

      <div className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        Data
      </div>
      <dl className="rule-t">
        {data.map((r) => (
          <div
            key={r.k}
            className="rule-b row-2up-end py-4"
          >
            <dt className="text-[14.5px] text-[var(--color-cite)]">
              {r.k}
              {r.note && (
                <span className="block font-mono text-[11px] text-[var(--color-mute)] mt-0.5">
                  {r.note}
                </span>
              )}
            </dt>
            <dd className="font-mono text-[14px] tabular-nums text-[var(--color-ink)] text-right">
              {r.v}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-12 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        Endpoints · check them yourself
      </div>
      <ul className="rule-t">
        {endpoints.map((e) => (
          <li
            key={e.path}
            className="rule-b row-2up-end py-4"
          >
            <code className="font-mono text-[13px] text-[var(--color-ink)] break-all">
              {e.path}
            </code>
            <span className="font-mono text-[11px] text-[var(--color-mute)] sm:text-right">
              {e.note}
            </span>
          </li>
        ))}
      </ul>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Incident log
        </div>
        <div className="rule-t">
          <div className="rule-b py-5">
            <div className="font-mono text-[12px] tabular-nums text-[var(--color-ink)]">
              2026-08-01 · 13:27-17:05 UTC · full outage, 3h40m
            </div>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
              The hosting platform disabled all deployments after the account
              crossed a compute usage cap; every page and API on this domain
              returned HTTP 402 until the plan was upgraded. Detected by
              monitoring in 6 minutes; resolved in 3h40m. No data was lost, no
              verdict changed, and locally installed gates kept enforcing their
              pins throughout - the failure boundary held as documented at{' '}
              <Link href="/reliability" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
                /reliability
              </Link>
              . Follow-ups shipped: an independent status page, account usage
              alerting, and a scoped write credential for the verdict pipeline.
            </p>
          </div>
        </div>
        <p className="mt-4 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          Failures stated plainly are part of the same honesty contract as the
          verdicts.
        </p>
      </section>

      <p className="mt-10 font-mono text-[12px] text-[var(--color-mute)]">
        More numbers:{' '}
        <Link href="/stats" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          how many MCP servers there are
        </Link>
        {' · '}
        <Link href="/trust" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          trust model
        </Link>
      </p>
    </article>
  );
}
