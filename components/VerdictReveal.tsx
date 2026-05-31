'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { Decision, DimensionVerdict } from '@/lib/verdicts';

// Auto-cycling "watch the product work" reveal. Each item is a REAL verdict
// from the index (no fabrication): tool -> brief scan -> the verdict stamps in.
// Pauses on hover; respects prefers-reduced-motion (no scan, content still cycles).

export type RevealItem = {
  slug: string;
  name: string;
  decision: Decision;
  rationale: string;
  dims: { label: string; verdict: DimensionVerdict }[];
};

const DECISION: Record<Decision, { cls: string; label: string }> = {
  ALLOW: { cls: 'text-emerald-700 bg-emerald-50 border-emerald-300', label: 'ALLOW' },
  DENY: { cls: 'text-red-700 bg-red-50 border-red-300', label: 'DENY' },
  REVIEW: { cls: 'text-amber-700 bg-amber-50 border-amber-300', label: 'REVIEW' },
};
const DIM: Record<DimensionVerdict, string> = {
  PASS: 'text-emerald-700 border-emerald-300',
  FAIL: 'text-red-700 border-red-300',
  UNVERIFIED: 'text-stone-500 border-stone-300',
  ERROR: 'text-amber-700 border-amber-300',
};

const SCAN_MS = 750;
const HOLD_MS = 3100;

export function VerdictReveal({ items }: { items: RevealItem[] }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'scan' | 'show'>('show');
  const [paused, setPaused] = useState(false);
  const first = useRef(true);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (items.length === 0 || paused) return;
    // First item paints fully (correct SSR / first paint); later items get the
    // brief scan-then-stamp animation.
    let t1: ReturnType<typeof setTimeout> | null = null;
    if (first.current || reduced) {
      first.current = false;
      setPhase('show');
    } else {
      setPhase('scan');
      t1 = setTimeout(() => setPhase('show'), SCAN_MS);
    }
    const t2 = setTimeout(() => setI((p) => (p + 1) % items.length), HOLD_MS + SCAN_MS);
    return () => {
      if (t1) clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [i, items.length, paused, reduced]);

  if (items.length === 0) return null;
  const item = items[i];
  const d = DECISION[item.decision];
  const scanning = phase === 'scan';

  return (
    <div
      className="rule-t rule-b rule-l rule-r bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* header: the tool under test */}
      <div className="rule-b px-5 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-1">
            screening
          </div>
          <Link
            href={`/server/${item.slug}`}
            className="block font-mono text-[13.5px] text-[var(--color-ink)] hover:text-[var(--color-accent)] truncate"
          >
            {item.name}
          </Link>
        </div>
        <span
          className={`shrink-0 font-mono text-[14px] uppercase tracking-[0.14em] border px-3 py-1.5 transition-all duration-300 ${
            scanning ? 'opacity-0 scale-90 text-stone-400 border-stone-200' : `opacity-100 scale-100 ${d.cls}`
          }`}
        >
          {scanning ? '· · ·' : d.label}
        </span>
      </div>

      {/* scan progress bar */}
      <div className="h-[2px] bg-[var(--color-rule)] overflow-hidden">
        <div
          className="h-full bg-[var(--color-accent)]"
          style={{
            width: scanning ? '0%' : '100%',
            transition: scanning ? 'none' : `width ${SCAN_MS}ms linear`,
          }}
        />
      </div>

      {/* body: rationale + dimensions, fade in on 'show' */}
      <div
        className="px-5 py-4 transition-opacity duration-300"
        style={{ opacity: scanning ? 0.25 : 1 }}
      >
        <p className="text-[13.5px] leading-[1.55] text-[var(--color-cite)] min-h-[42px]">
          {item.rationale}
        </p>
        {item.dims.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {item.dims.map((dim, k) => (
              <span
                key={k}
                className={`font-mono text-[10.5px] uppercase tracking-[0.1em] border px-2 py-0.5 ${DIM[dim.verdict]}`}
              >
                {dim.label} · {dim.verdict.toLowerCase()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* cycle indicator */}
      <div className="rule-t px-5 py-3 flex items-center gap-1.5">
        {items.map((_, k) => (
          <span
            key={k}
            className="h-1.5 rounded-full transition-all duration-300"
            style={{
              width: k === i ? 18 : 6,
              backgroundColor: k === i ? 'var(--color-accent)' : 'var(--color-rule)',
            }}
          />
        ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          real verdicts · hover to pause
        </span>
      </div>
    </div>
  );
}
