'use client';

import Link from 'next/link';
import { trackCtaClick } from '@/lib/track-cta';

/**
 * ICP-1 install bridge on /drift-report (build plan #11): the same continuous-protection
 * pitch + first-HOLD walkthrough as the server-page CTA (ServerVerdictCta pattern), with its
 * OWN gate_cta_click source so report arrivals feed the aggregate click-to-install ratio as a
 * distinguishable cohort. Exactly one tracked event fires per click.
 */
export function DriftReportCta() {
  return (
    <section className="mt-12 rule-t pt-6" aria-labelledby="drift-report-cta-heading">
      <h2
        id="drift-report-cta-heading"
        className="text-[15px] font-medium tracking-tight text-[var(--color-ink)]"
      >
        These numbers are observations after the fact.
      </h2>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-cite)] max-w-2xl">
        The report tells you contracts change underneath agents; it cannot stop the next one.
        The gate pins every tool contract your agent uses on first sight and holds the call
        when a pinned contract changes - the check that keeps being true on Tuesday.
      </p>
      <p className="mt-3">
        <Link
          href="/guides/install-the-gate-first-hold"
          onClick={() => trackCtaClick('drift_report_cta')}
          className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-ink)] border border-[var(--color-rule)] px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          See your first HOLD in 2 minutes →
        </Link>
      </p>
      <p className="mt-4 text-[13px] leading-[1.55] text-[var(--color-mute)] max-w-2xl">
        Background:{' '}
        {/* Anchor text INTENTIONALLY differs from the linked guide's own title, which leads with
            the scare-vocabulary term this page's copy-pin bans. That term is question-layer
            wording: fine on the guide, which answers what people actually search for, but this is
            the /drift-report evidence surface, where lib/reportStats.test.ts forbids scare framing
            so a published statistic is never wrapped in an accusation. The href is unchanged, so
            the crawl path added in 618fc46 is fully preserved; only the visible words differ.
            Do NOT "consistency-fix" this to match the guide title - it will fail the pin, and the
            pin is right. (The pin greps raw source, so it catches comments too - hence the
            circumlocution here.) */}
        <Link
          href="/guides/mcp-silent-contract-drift"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          silent contract drift
        </Link>
        {' · '}
        <Link
          href="/guides/mcp-lock"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          mcp.lock
        </Link>
      </p>
    </section>
  );
}
