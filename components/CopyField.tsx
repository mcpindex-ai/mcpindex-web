'use client';

import { useState } from 'react';

// Click-to-copy command box (npm's install-affordance pattern). Client-only
// for navigator.clipboard; degrades to a selectable code box if copy fails.
export function CopyField({
  value,
  label,
  notes,
}: {
  value: string;
  label?: string;
  notes?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* selection fallback: the text is selectable in the pre */
    }
  };

  return (
    <div className="mt-3 first:mt-0">
      {label && (
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-cite)] mb-1.5">
          {label}
        </div>
      )}
      {notes && <p className="text-[12px] leading-[1.5] text-[var(--color-mute)] mb-2">{notes}</p>}
      <div className="relative">
        <pre className="bg-[var(--color-ink)] text-zinc-100 pl-4 pr-14 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
          <code>{value}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
          className="absolute top-2 right-2 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-1.5 py-0.5 transition-colors"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
    </div>
  );
}
