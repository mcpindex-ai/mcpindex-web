import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers, loadSnapshot } from '@/lib/registry';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Daily diff of the MCP server registry — what was added, what changed version, what was deprecated.',
  alternates: {
    canonical: 'https://mcpindex.ai/changelog',
    types: { 'application/rss+xml': 'https://mcpindex.ai/changelog.rss' },
  },
};

function bucketByDay(servers: Array<{ publishedAt: string }>) {
  const map = new Map<string, number>();
  for (const s of servers) {
    const day = s.publishedAt.slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default async function Changelog() {
  const [servers, snap] = await Promise.all([loadServers(), loadSnapshot()]);

  // Group servers by publishedAt day, latest 30 days only.
  const sorted = [...servers].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = sorted.filter((s) => new Date(s.publishedAt).getTime() > cutoff);
  const byDay = new Map<string, typeof sorted>();
  for (const s of recent) {
    const day = s.publishedAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(s);
  }

  const buckets = bucketByDay(servers);

  return (
    <article className="mx-auto max-w-[920px] px-6 sm:px-10 pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
          §01&nbsp;&nbsp;Changelog
        </div>
        <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
          Registry diff · last 30 days.
        </h1>
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[12.5px] text-[--color-mute]">
          <span>
            Snapshot:{' '}
            <span className="text-[--color-cite]">{new Date(snap.fetchedAt).toUTCString()}</span>
          </span>
          <span>
            Subscribe:{' '}
            <Link href="/changelog.rss" className="text-[--color-accent] hover:underline">
              RSS
            </Link>
          </span>
        </div>
      </header>

      <section className="mt-12">
        {[...byDay.entries()].map(([day, list]) => (
          <div key={day} className="rule-t py-6">
            <div className="grid sm:grid-cols-[140px_1fr] gap-4">
              <div className="font-mono text-[12px] text-[--color-cite] tabular-nums">
                {day}
                <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[--color-mute] mt-1">
                  +{list.length} added
                </div>
              </div>
              <ul className="space-y-3">
                {list.slice(0, 12).map((s) => (
                  <li key={s.slug} className="text-[14px]">
                    <Link
                      href={`/server/${s.slug}`}
                      className="font-medium text-[--color-ink] hover:text-[--color-accent]"
                    >
                      {s.title}
                    </Link>
                    <span className="font-mono text-[11px] text-[--color-mute] ml-2">
                      {s.name}
                    </span>
                    <span className="font-mono text-[11px] text-[--color-mute] ml-2">
                      · {CATEGORY_LABELS[s.category] ?? s.category}
                    </span>
                  </li>
                ))}
                {list.length > 12 && (
                  <li className="font-mono text-[11px] text-[--color-mute]">
                    + {list.length - 12} more
                  </li>
                )}
              </ul>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-16 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
          §02&nbsp;&nbsp;Daily counts (all-time)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 font-mono text-[12px]">
          {buckets.slice(0, 28).map(([day, count]) => (
            <div key={day} className="flex justify-between text-[--color-cite]">
              <span>{day}</span>
              <span className="tabular-nums text-[--color-mute]">{count}</span>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
