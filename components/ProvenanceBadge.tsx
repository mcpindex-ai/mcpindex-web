// The unfakeable differentiator, made into a recurring mark: verdict history
// is hash-chained and timestamped to Bitcoin via OpenTimestamps. Honest by
// construction - it claims "anchored history exists", not minute-level ordering
// (see /methodology honest limits).
export function ProvenanceBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-mute)] ${className}`}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="3" y="7" width="10" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="10.4" r="1.1" fill="currentColor" />
      </svg>
      hash-chained history
    </span>
  );
}
