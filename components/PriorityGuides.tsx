import Link from 'next/link';
import { GUIDES_HUB, PRIORITY_GUIDES } from '@/lib/priority-guides';

const LINK =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)] hover:decoration-[var(--color-accent-strong)]';

/**
 * Named links to the SEO-first guide wave + /guides hub. Used on already-
 * crawled pages so Googlebot has an internal path into guides that are in
 * the sitemap but not yet indexed.
 */
export function PriorityGuides({
  kicker = 'Guides',
  intro,
  className = '',
}: {
  kicker?: string;
  intro?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label="Priority guides"
      className={className}
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        {kicker}
      </div>
      {intro ? (
        <p className="mt-2 text-[14px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
          {intro}
        </p>
      ) : null}
      <ul className="mt-4 space-y-2 text-[14.5px] leading-[1.5] text-[var(--color-cite)]">
        {PRIORITY_GUIDES.map((g) => (
          <li key={g.href}>
            <Link href={g.href} className={LINK}>
              {g.label}
            </Link>
          </li>
        ))}
        <li>
          <Link href={GUIDES_HUB.href} className={LINK}>
            {GUIDES_HUB.label} →
          </Link>
        </li>
      </ul>
    </nav>
  );
}
