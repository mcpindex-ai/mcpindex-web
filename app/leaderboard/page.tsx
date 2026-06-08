import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers } from '@/lib/registry';
import { rankByQuality } from '@/lib/quality';
import { listScreened } from '@/lib/verdicts';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Maturity Rankings',
  description:
    'Top MCP servers ranked by listing maturity (Quality Score from public registry signals). Trust verdict shown separately — not used for sort order.',
};

const VERDICT_CHIP: Record<string, string> = {
  ALLOW: 'border-emerald-300 text-emerald-700 bg-emerald-50',
  DENY: 'border-red-300 text-red-700 bg-red-50',
  REVIEW: 'border-amber-300 text-amber-700 bg-amber-50',
};

function VerdictTag({ dec }: { dec?: string }) {
  return dec ? (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.12em] border px-1.5 py-0.5 ${VERDICT_CHIP[dec] ?? ''}`}
    >
      {dec.toLowerCase()}
    </span>
  ) : (
    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--color-mute)]">
      not screened
    </span>
  );
}

export default async function Leaderboard() {
  const [servers, screened] = await Promise.all([loadServers(), listScreened()]);
  const ranked = rankByQuality(servers).slice(0, 50);
  const verdictBySlug = new Map(
    screened.map((s) => [s.slug, s.verdict.directive.decision]),
  );

  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Maturity Rankings · top 50 by quality score
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          Quality, and the verdict.
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          Sorted by listing maturity only: freshness, completeness, installability,
          documentation, and semver stability (see{' '}
          <code className="font-mono text-[13px] text-[var(--color-ink)]">lib/quality.ts</code>
          ). Trust verdict is shown beside each row but does not affect rank — most
          maturity-leaders aren&rsquo;t screened yet.{' '}
          <Link
            href="/methodology"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
          >
            Methodology
          </Link>{' '}
          is open and PR-friendly.
        </p>
      </header>

      {/* column header */}
      <div className="mt-12 hidden sm:grid grid-cols-[60px_1fr_150px_120px_110px] gap-4 px-2 pb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        <span>#</span>
        <span>server</span>
        <span>category</span>
        <span className="text-right">trust verdict</span>
        <span className="text-right">quality</span>
      </div>

      <ol className="rule-t">
        {ranked.map((row, i) => {
          const dec = verdictBySlug.get(row.server.slug);
          return (
            <li
              key={row.server.slug}
              className="rule-b row-leaderboard px-2 py-5 group hover:bg-[var(--color-accent-soft)]/40 transition-colors"
            >
              <span className="font-mono text-[12px] text-[var(--color-mute)] tabular-nums">
                #{String(i + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/server/${row.server.slug}`}
                  className="block font-medium text-[15.5px] text-[var(--color-ink)] group-hover:text-[var(--color-accent)] truncate transition-colors"
                >
                  {row.server.title}
                </Link>
                <div className="mt-0.5 font-mono text-[11px] text-[var(--color-mute)] truncate">
                  {row.server.name} · v{row.server.version}
                </div>
                {/* trust axis on mobile (sits under the name) */}
                <div className="mt-1.5 sm:hidden">
                  <VerdictTag dec={dec} />
                </div>
              </div>
              <div className="hidden sm:block font-mono text-[11px] text-[var(--color-mute)] truncate">
                {CATEGORY_LABELS[row.server.category] ?? row.server.category}
              </div>
              {/* trust axis (desktop column) */}
              <div className="hidden sm:block text-right">
                <VerdictTag dec={dec} />
              </div>
              {/* quality axis */}
              <div className="text-right font-mono tabular-nums">
                <span className="text-[22px] text-[var(--color-ink)]">{row.score}</span>
                <span className="text-[11px] text-[var(--color-mute)] ml-1">/100</span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          Quality computed from snapshot · refreshes daily
        </p>
        <p className="font-mono text-[12px] text-[var(--color-mute)]">
          Screened so far:{' '}
          <span className="text-[var(--color-ink)] tabular-nums">{screened.length}</span> tools.{' '}
          <Link
            href="/best"
            className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            browse the evidence →
          </Link>
        </p>
      </div>
    </article>
  );
}
