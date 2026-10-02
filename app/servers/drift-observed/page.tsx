import type { Metadata } from 'next';
import Link from 'next/link';
import { loadServers } from '@/lib/registry';
import { browseSort } from '@/lib/serversBrowse';
import { indexablePredicate } from '@/lib/indexable';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'MCP servers with observed contract drift · A-Z',
  description:
    'Every MCP server whose tool contract or context surface the mcpindex crawler has seen change between daily snapshots, A to Z. Each entry links its record and drift history.',
  alternates: { canonical: 'https://mcpindex.ai/servers/drift-observed' },
};

// The crawl path to the server pages offered to search (lib/indexable.ts). One page, no
// pagination: a few thousand links is within what a crawler reads, and a paginated hub over this
// set would churn page membership on every sync the way /servers/page/n does.
export default async function DriftObservedServers() {
  const [servers, indexable] = await Promise.all([loadServers(), indexablePredicate()]);
  const items = browseSort(servers.filter((s) => s.status !== 'deprecated' && indexable(s.name)));
  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Drift observed · {items.length.toLocaleString('en-US')} servers
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          Servers whose contract changed.
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          MCP servers where the mcpindex crawler saw a tool contract or context surface change between
          daily snapshots, A to Z. A change is a contract diff, never a safety verdict. Counts and
          kinds are on each record and in the{' '}
          <Link href="/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            public ledger
          </Link>
          ; the full index is under{' '}
          <Link href="/servers" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            all servers
          </Link>
          .
        </p>
      </header>

      <ul className="mt-12 rule-t sm:columns-2 lg:columns-3 gap-x-8">
        {items.map((s) => (
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
    </article>
  );
}
