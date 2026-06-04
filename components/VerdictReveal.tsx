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

  // Track reduced-motion as state so a runtime change is respected and the
  // auto-advance timer is correctly gated (not just the scan animation).
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // A reader-controlled pause (the visible Pause/Play toggle). Combined with the
  // hover/focus pause below into the effective `paused` gate.
  const [userPaused, setUserPaused] = useState(false);
  const effectivePaused = paused || userPaused;

  useEffect(() => {
    if (items.length === 0 || effectivePaused) return;
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
    // WCAG 2.2.2: under prefers-reduced-motion we do NOT auto-advance the
    // content - the reader steps manually via the dot buttons. Otherwise the
    // timer cycles, pausable by the toggle, hover, or keyboard focus.
    let t2: ReturnType<typeof setTimeout> | null = null;
    if (!reduced) {
      t2 = setTimeout(() => setI((p) => (p + 1) % items.length), HOLD_MS + SCAN_MS);
    }
    return () => {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
    };
  }, [i, items.length, effectivePaused, reduced]);

  if (items.length === 0) return null;
  const item = items[i];
  const d = DECISION[item.decision];
  const scanning = phase === 'scan';

  return (
    <div
      className="rule-t rule-b rule-l rule-r bg-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        // resume only when focus leaves the whole widget (not on inner refocus)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setPaused(false);
      }}
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

      {/* body: rationale + dimensions, fade in on 'show'. aria-live so the
          swap is announced to assistive tech (WCAG 2.2.2 companion). */}
      <div
        className="px-5 py-4 transition-opacity duration-300"
        style={{ opacity: scanning ? 0.25 : 1 }}
        aria-live="polite"
        aria-atomic="true"
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

      {/* cycle indicator + controls. Dots are real buttons (keyboard-steppable,
          required when reduced-motion suppresses auto-advance); a visible
          Pause/Play toggle satisfies WCAG 2.2.2 for the auto-cycling content. */}
      <div className="rule-t px-5 py-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setUserPaused((p) => !p)}
          aria-pressed={userPaused}
          className="mr-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-mute)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          {userPaused || reduced ? '▸ play' : '❚❚ pause'}
        </button>
        {items.map((_, k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              first.current = true; // step without the scan animation
              setI(k);
            }}
            aria-label={`Show verdict ${k + 1} of ${items.length}`}
            aria-current={k === i ? 'true' : undefined}
            className="h-3 flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <span
              className="h-1.5 rounded-full transition-all duration-300 block"
              style={{
                width: k === i ? 18 : 6,
                backgroundColor: k === i ? 'var(--color-accent)' : 'var(--color-rule)',
              }}
            />
          </button>
        ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          {reduced ? 'real verdicts · step with the dots' : 'real verdicts · pause or hover'}
        </span>
      </div>
    </div>
  );
}
