import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Not found',
  robots: { index: false, follow: false },
  // `null`, not a self-canonical: this component renders for EVERY URL on the domain that
  // resolves to no route, so there is no one URL it could name. (Do not reach for the
  // shorter adjective here — scripts/check-graduation-honesty.mjs scans all source for
  // moat-exclusivity words and "un-matched" is on that list, so it fails the build.)
  // Without the override it inherits the root
  // layout's `alternates.canonical` (app/layout.tsx) — the homepage — and every 404 on the
  // site then tells Google "index the homepage in place of this", contradicting the noindex
  // directly above. Next resolves `alternates` by wholesale replacement, not merge
  // (lib/metadata/resolve-metadata.js), so this suppresses the tag rather than emitting one.
  alternates: { canonical: null },
};

export default function NotFound() {
  return (
    <article className="site-container pt-20 pb-28">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        404
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Page not found.
      </h1>
      <p className="mt-4 max-w-xl text-[15px] leading-[1.55] text-[var(--color-cite)]">
        That URL doesn&apos;t match anything on mcpindex.ai. The gate can&apos;t HOLD a
        page that was never pinned.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link
          href="/"
          className="font-mono text-[12.5px] uppercase tracking-[0.14em] text-[var(--color-ink)] border border-[var(--color-rule)] px-5 py-3 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          Back home →
        </Link>
        <Link
          href="/docs"
          className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          Docs →
        </Link>
        <Link
          href="/screen"
          className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          Screen a tool →
        </Link>
      </div>
    </article>
  );
}
