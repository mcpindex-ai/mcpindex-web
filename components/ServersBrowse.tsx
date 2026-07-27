import Link from 'next/link';
import type { BrowsePage } from '@/lib/serversBrowse';
import { CATEGORY_LABELS } from '@/lib/categorize';

// Shared renderer for /servers and /servers/page/[n]. Pure presentation: the
// route owns data loading and range validation.
export function ServersBrowse({ data }: { data: BrowsePage }) {
  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          All servers · page {data.page} of {data.totalPages}
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          Browse the index.
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          {data.totalServers.toLocaleString('en-US')} MCP servers indexed by mcpindex (the registry snapshot plus a small editorially admitted set)
          snapshot, A to Z. Rankings live on the{' '}
          <Link href="/leaderboard" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            leaderboard
          </Link>
          ; curated picks under{' '}
          <Link href="/best" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            Best of
          </Link>
          .
        </p>
      </header>

      <ul className="mt-12 rule-t sm:columns-2 lg:columns-3 gap-x-8">
        {data.items.map((s) => (
          <li key={s.slug} className="break-inside-avoid">
            <Link
              href={`/server/${s.slug}`}
              className="rule-b block py-3 hover:text-[var(--color-accent-strong)] transition-colors group"
            >
              <span className="block text-[14px] leading-snug text-[var(--color-ink)] group-hover:text-[var(--color-accent-strong)]">
                {s.title || s.name}
              </span>
              <span className="mt-0.5 block font-mono text-[10.5px] text-[var(--color-mute)]">
                {CATEGORY_LABELS[s.category] ?? s.category}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <Pagination page={data.page} totalPages={data.totalPages} />
    </article>
  );
}

function pageHref(n: number): string {
  return n === 1 ? '/servers' : `/servers/page/${n}`;
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  // A crawlable window around the current page plus first/last anchors, so the
  // whole hub is reachable in O(log n) hops from page 1.
  const window: number[] = [];
  for (let n = Math.max(1, page - 3); n <= Math.min(totalPages, page + 3); n++) window.push(n);
  const cls = 'px-2 py-1 hover:text-[var(--color-accent-strong)]';
  const current = 'px-2 py-1 text-[var(--color-ink)] font-medium';
  return (
    <nav aria-label="Pagination" className="mt-10 flex flex-wrap items-center gap-1 font-mono text-[12px] text-[var(--color-mute)]">
      {page > 1 && (
        <>
          <Link href={pageHref(1)} className={cls}>« 1</Link>
          <Link href={pageHref(page - 1)} className={cls} rel="prev">‹ prev</Link>
        </>
      )}
      {window.map((n) =>
        n === page ? (
          <span key={n} className={current} aria-current="page">{n}</span>
        ) : (
          <Link key={n} href={pageHref(n)} className={cls}>{n}</Link>
        ),
      )}
      {page < totalPages && (
        <>
          <Link href={pageHref(page + 1)} className={cls} rel="next">next ›</Link>
          <Link href={pageHref(totalPages)} className={cls}>{totalPages} »</Link>
        </>
      )}
    </nav>
  );
}
