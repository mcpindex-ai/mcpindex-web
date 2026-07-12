'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { INSTALL_SHELL_COMMAND } from '@/lib/install-command';
import { trackGateInstallCopy } from '@/lib/track-gate-install';

/** Hero primary CTA: copy install command immediately (no scroll tax). */
export function InstallCtaButton() {
  const [toast, setToast] = useState(false);

  const dismissToast = useCallback(() => {
    setToast(false);
  }, []);

  const showToast = useCallback(() => {
    setToast(true);
    window.setTimeout(dismissToast, 3200);
  }, [dismissToast]);

  const handleClick = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_SHELL_COMMAND);
      trackGateInstallCopy('homepage_hero_cta');
      showToast();
    } catch {
      /* clipboard blocked — hero CopyField remains as fallback */
      const field = document.getElementById('install');
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showToast]);

  const toastNode = toast ? (
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
      {toastNode ? createPortal(toastNode, document.body) : null}
    </>
  );
}
