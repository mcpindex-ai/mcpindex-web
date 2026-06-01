import Link from 'next/link';
import type { Metadata } from 'next';
import { loadSnapshot, loadServers } from '@/lib/registry';
import { listScreened } from '@/lib/verdicts';
import { timeAgo } from '@/lib/time';

export const metadata: Metadata = {
  title: 'Status',
  description:
    'mcpindex system status: data freshness, coverage, sync cadence, checkable live endpoints, and incident log. Real figures, revalidated hourly; authoritative uptime is monitored externally.',
};

// Revalidate hourly so the freshness figures stay live without rebuilding.
export const revalidate = 3600;

export default async function StatusPage() {
  const [snap, servers, screened] = await Promise.all([
    loadSnapshot(),
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
      note: 'synced daily at 06:00 UTC from the official MCP registry',
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
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Status
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        System status.
      </h1>
      <p className="mt-5 max-w-[640px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        The figures below are real and revalidate hourly. Authoritative uptime
        is monitored externally; the endpoints are public, so you can check
        liveness yourself rather than take a green light on faith.
      </p>

      <div className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        Data
      </div>
      <dl className="rule-t">
        {data.map((r) => (
          <div
            key={r.k}
            className="rule-b grid grid-cols-[1fr_auto] gap-4 py-4 items-baseline"
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
            className="rule-b grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-1 sm:gap-4 py-4"
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
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          No incidents recorded. When one occurs, it will be posted here with a
          timestamp and a short postmortem - failures stated plainly are part of
          the same honesty contract as the verdicts.
        </p>
      </section>

      <p className="mt-10 font-mono text-[12px] text-[var(--color-mute)]">
        More numbers at{' '}
        <Link href="/stats" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
          /stats
        </Link>
        {' · '}
        <Link href="/trust" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
          trust model
        </Link>
      </p>
    </article>
  );
}
