import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers } from '@/lib/registry';
import { rankByQuality } from '@/lib/quality';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Leaderboard',
  description:
    'Top 50 MCP servers ranked by composite Quality Score across freshness, completeness, installability, documentation, and stability.',
};

export default async function Leaderboard() {
  const servers = await loadServers();
  const ranked = rankByQuality(servers).slice(0, 50);

  return (
    <article className="mx-auto max-w-[1080px] px-6 sm:px-10 pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
          §01&nbsp;&nbsp;Leaderboard · top 50
        </div>
        <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
          MCP Quality Score
        </h1>
        <p className="mt-4 max-w-[680px] text-[15.5px] leading-[1.55] text-[--color-cite]">
          Five-dimension composite score from public registry data only — freshness,
          completeness, installability, documentation, semver stability.{' '}
          <Link href="/methodology" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent] hover:decoration-[--color-accent]">
            Methodology
          </Link>
          {' '}is open and PR-friendly.
        </p>
      </header>

      <ol className="mt-12 rule-t">
        {ranked.map((row, i) => (
          <li
            key={row.server.slug}
            className="rule-b grid grid-cols-[40px_1fr_auto] sm:grid-cols-[60px_1fr_180px_140px_120px] gap-4 px-2 py-5 items-baseline group hover:bg-[--color-accent-soft]/40 transition-colors"
          >
            <span className="font-mono text-[12px] text-[--color-mute] tabular-nums">
              #{String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <Link
                href={`/server/${row.server.slug}`}
                className="block font-medium text-[15.5px] text-[--color-ink] group-hover:text-[--color-accent] truncate transition-colors"
              >
                {row.server.title}
              </Link>
              <div className="mt-0.5 font-mono text-[11px] text-[--color-mute] truncate">
                {row.server.name}
              </div>
            </div>
            <div className="hidden sm:block font-mono text-[11px] text-[--color-mute] truncate">
              {CATEGORY_LABELS[row.server.category] ?? row.server.category}
            </div>
            <div className="hidden sm:block font-mono text-[11px] text-[--color-mute] tabular-nums truncate">
              v{row.server.version}
            </div>
            <div className="text-right font-mono tabular-nums">
              <span className="text-[22px] text-[--color-ink]">{row.score}</span>
              <span className="text-[11px] text-[--color-mute] ml-1">/100</span>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[--color-mute]">
        Computed from snapshot · refreshes daily
      </p>
    </article>
  );
}
