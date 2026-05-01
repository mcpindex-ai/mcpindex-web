import Link from 'next/link';
import type { Metadata } from 'next';
import { loadServers } from '@/lib/registry';
import { ALL_CATEGORIES, CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Best of · curated MCP server picks by category',
  description: 'Browse curated MCP server picks across 28+ categories — databases, browsers, devtools, productivity, and more.',
};

export default async function BestIndex() {
  const servers = await loadServers();
  const counts = new Map<string, number>();
  for (const s of servers) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);

  return (
    <article className="mx-auto max-w-[1080px] px-6 sm:px-10 pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
          §01&nbsp;&nbsp;Best of · index
        </div>
        <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
          Curated picks by category.
        </h1>
        <p className="mt-4 max-w-[680px] text-[15.5px] leading-[1.55] text-[--color-cite]">
          {ALL_CATEGORIES.length} categories. Each page ranks the top servers by{' '}
          <Link href="/methodology" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
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
              className="rule-b flex items-baseline justify-between py-4 hover:text-[--color-accent] transition-colors group"
            >
              <span className="text-[15px] text-[--color-ink] group-hover:text-[--color-accent]">
                {CATEGORY_LABELS[c] ?? c}
              </span>
              <span className="font-mono text-[11px] text-[--color-mute] tabular-nums">
                {counts.get(c) ?? 0}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
