import type { Metadata } from 'next';
import Link from 'next/link';
import { ServerSearch } from '@/components/ServerSearch';

// A navigation hub: search the indexed MCP-server directory by name/category/keyword and jump to a
// server's page (where its trust verdict + maturity score live). The page itself is indexable as an
// internal-linking entry point; results are client-fetched, so no thin per-query URLs are created.
export const metadata: Metadata = {
  title: 'Search MCP servers',
  description:
    'Search the mcpindex directory of MCP servers by name, category, or keyword, and open any server to see its trust verdict and maturity score.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const initialQuery = typeof q === 'string' ? q : '';

  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Search · MCP server directory
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Find an MCP server.</h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          Search the public directory by name, category, or keyword. Open any result for its trust
          verdict, maturity score, and install commands. Prefer to browse?{' '}
          <Link
            href="/best"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            By category
          </Link>{' '}
          or the{' '}
          <Link
            href="/leaderboard"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            maturity rankings
          </Link>
          .
        </p>
      </header>

      <ServerSearch initialQuery={initialQuery} />
    </article>
  );
}
