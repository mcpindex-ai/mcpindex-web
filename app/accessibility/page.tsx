import type { Metadata } from 'next';
import Link from 'next/link';
import { ObfuscatedEmail } from '@/components/ObfuscatedEmail';

export const metadata: Metadata = {
  title: 'Accessibility',
  description:
    'Accessibility statement for mcpindex.ai: what we aim for, known gaps, and how to report issues.',
  alternates: { canonical: 'https://mcpindex.ai/accessibility' },
};

export default function AccessibilityPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Accessibility
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Accessibility.
      </h1>
      <p className="mt-2 font-mono text-[11.5px] text-[var(--color-mute)]">
        Last updated: 2026-07-12
      </p>

      <div className="mt-10 space-y-6 text-[14.5px] leading-[1.65] text-[var(--color-cite)]">
        <p>
          mcpindex.ai aims to be usable with keyboard navigation, screen readers, and
          common assistive technologies. We follow WCAG 2.2 Level AA as a practical target
          for new work. This is not a formal certification or audit claim.
        </p>
        <p>
          The site includes a skip-to-content link, labeled navigation landmarks, and
          focus-visible outlines on interactive controls. Some older pages and dense
          technical tables may still have gaps.
        </p>
        <p>
          If you hit a barrier, email{' '}
          <ObfuscatedEmail
            user="hello"
            domain="mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          />{' '}
          with the page URL and what you were trying to do. We take those reports seriously.
        </p>
        <p>
          Related:{' '}
          <Link
            href="/privacy"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Privacy
          </Link>
          {' · '}
          <Link
            href="/terms"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Terms
          </Link>
          .
        </p>
      </div>
    </article>
  );
}
