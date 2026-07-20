'use client';

import Link from 'next/link';
import { trackCtaClick } from '@/lib/track-cta';

/**
 * Post-verdict conversion bridge (Loop B): the verdict above is a point-in-time
 * screen; this block sells the continuous half and routes into the first-HOLD
 * walkthrough. Its click event feeds the aggregate click-to-install ratio, so
 * exactly one tracked event fires per click.
 */
export function ServerVerdictCta({
  serverTitle,
  snapshotDay,
}: {
  serverTitle: string;
  snapshotDay: string;
}) {
  return (
    <section className="mt-8 rule-t pt-6" aria-labelledby="verdict-cta-heading">
      <h2
        id="verdict-cta-heading"
        className="text-[15px] font-medium tracking-tight text-[var(--color-ink)]"
      >
        That verdict was true at screening time{snapshotDay ? ` (snapshot ${snapshotDay})` : ''}.
      </h2>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
        Contracts can change after screening, with no version bump. The gate pins{' '}
        {serverTitle}&rsquo;s tool contracts on first sight and holds any silent change before
        your agent acts - the check that keeps being true on Tuesday.
      </p>
      <p className="mt-3">
        <Link
          href="/guides/install-the-gate-first-hold"
          onClick={() => trackCtaClick('server_verdict_cta')}
          className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-ink)] border border-[var(--color-rule)] px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          See your first HOLD in 2 minutes →
        </Link>
      </p>
    </section>
  );
}
