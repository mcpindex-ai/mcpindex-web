import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { UNREGISTERED } from '@/lib/unregistered';

export const revalidate = 86400;

export const metadata: Metadata = pageMetadata({
  title: 'Unregistered MCP servers',
  description:
    'Widely requested MCP servers with no vendor-published entry in the ' +
    'registry: what exists under each name, and what unregistered means for ' +
    'agent trust.',
  path: '/unregistered',
});

export default function UnregisteredIndexPage() {
  return (
    <article className="site-container pt-16 pb-24 max-w-[720px]">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Registry status
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Asked for constantly. Not in the registry.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        These names come up whenever people list the MCP servers they use, yet
        none has a vendor-published registry entry. Each page states what the
        registry actually holds under the name and what that means before an
        agent trusts a server carrying it.
      </p>

      <ul className="mt-10 rule-t">
        {UNREGISTERED.map((e) => (
          <li key={e.slug} className="py-3 border-b border-[var(--color-rule)]">
            <Link
              href={`/unregistered/${e.slug}`}
              className="text-[15px] font-medium text-[var(--color-ink)] hover:underline"
            >
              {e.name}
            </Link>
            <span className="ml-3 text-[13px] text-[var(--color-mute)]">
              no {e.vendor}-published entry
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}
