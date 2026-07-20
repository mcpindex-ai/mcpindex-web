import Link from 'next/link';

// "Open X, look for Y" callout. The self-maintaining substitute for a screenshot
// of a page that needs real data/state (/ledger, /receipts, /server/[slug]): we
// link to the live page (always current by definition) and tell the reader the
// one thing to notice there, instead of pasting a PNG that rots on the next UI
// change. Internal hrefs use next/link; external URLs render a plain anchor.
export function GuideDeepLink({
  href,
  label,
  lookFor,
}: {
  href: string;
  label: string;
  lookFor: string;
}) {
  const external = /^https?:\/\//.test(href);
  const linkClass =
    'font-medium text-[var(--color-ink)] underline decoration-[var(--color-accent-strong)] underline-offset-4 hover:text-[var(--color-accent-strong)]';

  return (
    <div className="mt-5 flex gap-3 border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)] pl-4 pr-4 py-3">
      <span aria-hidden className="mt-0.5 font-mono text-[12px] text-[var(--color-accent-strong)]">
        →
      </span>
      <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
        {external ? (
          <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
            {label}
          </a>
        ) : (
          <Link href={href} className={linkClass}>
            {label}
          </Link>
        )}
        <span className="text-[var(--color-mute)]"> — {lookFor}</span>
      </p>
    </div>
  );
}
