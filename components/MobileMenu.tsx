'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Mobile navigation disclosure. The desktop nav is `hidden md:flex`; without
// this the site had NO navigation below the md breakpoint (logo + GitHub only).
export function MobileMenu({
  items,
}: {
  items: { href: string; label: string; cta?: boolean }[];
}) {
  const [open, setOpen] = useState(false);

  // Keyboard dismiss (WCAG 2.1.2): Escape closes the panel. Per-link onClick
  // handles route-change close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          {open ? (
            <>
              <line x1="3.5" y1="3.5" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="14.5" y1="3.5" x2="3.5" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </>
          ) : (
            <>
              <line x1="2.5" y1="5" x2="15.5" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="2.5" y1="9" x2="15.5" y2="9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="2.5" y1="13" x2="15.5" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div className="fixed inset-x-0 top-14 z-50 bg-white border-b border-[var(--color-rule)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
          <nav className="site-container flex flex-col py-2">
            {items.map((item) =>
              item.cta ? (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="my-2 py-3 text-center font-mono text-[13px] uppercase tracking-[0.14em] text-white bg-[var(--color-accent-strong)] transition-colors hover:bg-[var(--color-accent-deep)]"
                >
                  {item.label}
                </Link>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-[var(--color-rule)] py-3.5 font-mono text-[14px] tracking-tight text-[var(--color-ink)] last:border-b-0 hover:text-[var(--color-accent-strong)]"
                >
                  {item.label}
                </Link>
              )
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
