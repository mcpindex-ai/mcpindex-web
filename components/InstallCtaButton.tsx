'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { INSTALL_SHELL_COMMAND } from '@/lib/install-command';

const INSTALL_SECTION_ID = 'install';

/** Hero primary CTA: scroll to #install, then copy the install command + toast. */
export function InstallCtaButton() {
  const [toast, setToast] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const dismissToast = useCallback(() => {
    setToast(false);
  }, []);

  const showToast = useCallback(() => {
    setToast(true);
    window.setTimeout(dismissToast, 3200);
  }, [dismissToast]);

  const copyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_SHELL_COMMAND);
      showToast();
    } catch {
      /* clipboard blocked — user can copy from the install block */
    }
  }, [showToast]);

  const handleClick = useCallback(() => {
    const section = document.getElementById(INSTALL_SECTION_ID);
    if (!section) {
      void copyCommand();
      return;
    }

    const rect = section.getBoundingClientRect();
    const alreadyVisible = rect.top >= 0 && rect.top < window.innerHeight * 0.45;

    if (alreadyVisible) {
      void copyCommand();
      return;
    }

    section.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.12);
        if (!hit) return;
        observer.disconnect();
        void copyCommand();
      },
      { threshold: [0.12, 0.25] },
    );
    observer.observe(section);

    window.setTimeout(() => observer.disconnect(), 5000);
  }, [copyCommand]);

  const toastNode =
    toast && mounted ? (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 max-w-[min(92vw,28rem)] border border-[var(--color-rule)] bg-[var(--color-ink)] px-4 py-3 shadow-lg pointer-events-none"
      >
        <p className="font-mono text-[12.5px] leading-snug text-zinc-100 text-center">
          Install command copied — paste in your terminal
        </p>
      </div>
    ) : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="font-mono text-[12.5px] uppercase tracking-[0.14em] text-white bg-[var(--color-accent)] px-6 py-3.5 hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        Install now →
      </button>
      {mounted && toastNode ? createPortal(toastNode, document.body) : null}
    </>
  );
}
