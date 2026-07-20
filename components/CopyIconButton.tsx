'use client';

import { useState } from 'react';

// Minimal click-to-copy affordance: a small icon + label, no visible code block.
// Click copies `value`; the icon flips to a check + "copied" briefly.

const Clip = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="5" y="5" width="9.2" height="9.2" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M11 5V3.6A1.6 1.6 0 0 0 9.4 2H3.6A1.6 1.6 0 0 0 2 3.6v5.8A1.6 1.6 0 0 0 3.6 11H5"
      stroke="currentColor"
      strokeWidth="1.4"
    />
  </svg>
);
const Check = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M3 8.5l3.4 3.4L13 5"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function CopyIconButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable: no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)] transition-colors"
    >
      {copied ? <Check /> : <Clip />}
      {copied ? 'copied' : label}
    </button>
  );
}
