import Link from 'next/link';
import { ContactTrigger } from '@/components/ContactModal';

export type Cta = { label: string; href?: string; contact?: 'pro' | 'enterprise' };

const ctaClass =
  'mt-8 inline-block w-fit font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-ink)] ' +
  'border border-[var(--color-rule)] px-3 py-1.5 hover:border-[var(--color-accent)] ' +
  'hover:text-[var(--color-accent)] cursor-pointer';

// Free tier keeps a plain link into the product; paid tiers open the shared
// in-browser contact modal (replacing the old mailto: links).
export function TierCTA({ cta }: { cta: Cta }) {
  if (cta.href) {
    return (
      <Link href={cta.href} className={ctaClass}>
        {cta.label} &rarr;
      </Link>
    );
  }
  if (cta.contact) {
    return (
      <ContactTrigger variant={cta.contact} className={ctaClass}>
        {cta.label} &rarr;
      </ContactTrigger>
    );
  }
  return null;
}
