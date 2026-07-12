import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers } from '@/lib/registry';
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Best of · curated MCP server picks by category',
  description: 'Browse curated MCP server picks across dozens of categories - databases, browsers, devtools, productivity, and more.',
  alternates: { canonical: 'https://mcpindex.ai/best' },
};

export default async function BestIndex() {
  const servers = await loadServers();
  const counts = new Map<string, number>();
  for (const s of servers) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);

  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Best of · index
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          Curated picks by category.
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          {ALL_CATEGORIES.length} categories. Each page ranks the top servers by{' '}
          <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            MCP Quality Score
          </Link>
          .
        </p>
      </header>

      <ul className="mt-12 rule-t grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
        {ALL_CATEGORIES.map((c) => (
          <li key={c}>
            <Link
              href={`/best/${c}`}
              className="rule-b flex items-baseline justify-between py-4 hover:text-[var(--color-accent)] transition-colors group"
            >
              <span className="text-[15px] text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">
                {CATEGORY_LABELS[c] ?? c}
              </span>
              <span className="font-mono text-[11px] text-[var(--color-mute)] tabular-nums">
                {counts.get(c) ?? 0}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
