import Link from 'next/link';
import type { Guide } from '@/lib/guides-content';
import { Prose } from './proseComponents';
import { renderEmbed } from '@/lib/guide-embeds';
import { GuideDeepLink } from './GuideDeepLink';
import { Disclose } from './Disclose';

// Renders a walkthrough guide (guide.steps present): a claim-first outcome
// banner + time estimate, an optional "see the payoff first" jump, a lede, the
// numbered steps (each an anchor target with its own embed / deep-link /
// troubleshoot), and an end-of-guide "next journey" CTA that chains the funnel.
// The classic flat-body render still lives in app/guides/[slug]/page.tsx.

export function GuideWalkthrough({ guide }: { guide: Guide }) {
  const steps = guide.steps ?? [];

  return (
    <div>
      {guide.outcome && (
        <div className="mt-8 rule-t rule-b rule-l rule-r bg-[var(--color-accent-soft)] p-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-accent-strong)]">
            What you&apos;ll have{guide.estMinutes ? ` · ~${guide.estMinutes} min` : ''}
          </div>
          <p className="mt-1.5 text-[15px] leading-[1.6] text-[var(--color-ink)]">{guide.outcome}</p>
        </div>
      )}

      {guide.impatient && (
        <a
          href={`#${guide.impatient.targetId}`}
          className="mt-4 inline-flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.1em] text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
        >
          {guide.impatient.label}
          <span aria-hidden>↓</span>
        </a>
      )}

      {guide.body.trim() && (
        <div className="mt-6">
          <Prose>{guide.body}</Prose>
        </div>
      )}

      <ol className="mt-10 space-y-0">
        {steps.map((step, i) => (
          <li key={step.id} id={step.id} className="scroll-mt-24 rule-t py-8">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[12px] text-[var(--color-accent)]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h2 className="group t-h3 font-medium text-[var(--color-ink)]">
                {step.heading}
                <a
                  href={`#${step.id}`}
                  aria-label={`Link to: ${step.heading}`}
                  className="ml-2 align-middle font-mono text-[13px] text-[var(--color-rule)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-[var(--color-accent)]"
                >
                  #
                </a>
              </h2>
            </div>

            <div className="mt-1 pl-[calc(1ch+0.75rem)]">
              <Prose>{step.body}</Prose>
              {step.embed && renderEmbed(step.embed)}
              {step.deepLink && (
                <GuideDeepLink
                  href={step.deepLink.href}
                  label={step.deepLink.label}
                  lookFor={step.deepLink.lookFor}
                />
              )}
              {step.troubleshoot && (
                <Disclose summary="Not seeing this?" className="mt-4">
                  <Prose>{step.troubleshoot}</Prose>
                </Disclose>
              )}
            </div>
          </li>
        ))}
      </ol>

      {guide.next && (
        <Link
          href={guide.next.href}
          className="group mt-10 flex items-center justify-between gap-4 rule-t rule-b rule-l rule-r p-4 transition-colors hover:bg-[var(--color-accent-soft)]"
        >
          <span>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
              Next
            </span>
            <span className="mt-1 block text-[15px] font-medium text-[var(--color-ink)]">
              {guide.next.label}
            </span>
          </span>
          <span
            aria-hidden
            className="font-mono text-[16px] text-[var(--color-accent)] transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      )}
    </div>
  );
}
