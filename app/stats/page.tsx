import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers, loadSnapshot } from '@/lib/registry';
import { ALL_CATEGORIES } from '@/lib/categorize';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Stats',
  description: 'Public dashboard. Servers indexed, categories tracked, snapshot freshness, all derived from public data.',
};

export default async function StatsPage() {
  const [servers, snap] = await Promise.all([loadServers(), loadSnapshot()]);
  const cats = new Set(servers.map((s) => s.category)).size;
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const last7Added = servers.filter((s) => new Date(s.publishedAt).getTime() > week).length;
  const withRemote = servers.filter((s) => s.hasRemote).length;
  const withPackage = servers.filter((s) => s.hasPackage).length;

  const stats: Array<{ label: string; value: string | number; note?: string }> = [
    { label: 'Servers indexed (active, latest)', value: servers.length.toLocaleString() },
    { label: 'Categories', value: `${cats} / ${ALL_CATEGORIES.length}` },
    { label: 'Added in last 7 days', value: `+${last7Added}` },
    { label: 'Remote endpoints', value: withRemote.toLocaleString() },
    { label: 'Runnable packages', value: withPackage.toLocaleString() },
    { label: 'Snapshot freshness', value: new Date(snap.fetchedAt).toUTCString() },
    {
      label: 'Source',
      value: 'registry.modelcontextprotocol.io',
      note: 'Anthropic-maintained, community-contributed.',
    },
    { label: 'API rate limit', value: '60 req/min/IP', note: 'hello@mcpindex.ai for higher limits' },
  ];

  return (
    <article className="mx-auto max-w-[920px] px-6 sm:px-10 pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
          §01&nbsp;&nbsp;Public stats · auto-generated daily
        </div>
        <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
          Numbers, on the page.
        </h1>
        <p className="mt-4 max-w-[640px] text-[15.5px] leading-[1.55] text-[--color-cite]">
          All metrics are derived from public registry data. No analytics tracking is sold or shared.
          Source code:{' '}
          <a
            href="https://github.com/mcpindex-ai"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]"
          >
            github.com/mcpindex-ai
          </a>
          .
        </p>
      </header>

      <dl className="mt-12 rule-t">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rule-b grid grid-cols-[1fr_auto] gap-6 py-5 px-2 items-baseline"
          >
            <dt className="font-mono text-[12.5px] text-[--color-cite]">
              {s.label}
              {s.note && (
                <span className="block mt-1 font-mono text-[11px] text-[--color-mute] normal-case">
                  {s.note}
                </span>
              )}
            </dt>
            <dd className="font-mono text-[16px] text-[--color-ink] tabular-nums text-right">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[--color-mute]">
        Page revalidates every hour ·{' '}
        <Link href="/api/registry-count" className="hover:text-[--color-accent]">
          /api/registry-count
        </Link>
      </p>
    </article>
  );
}
