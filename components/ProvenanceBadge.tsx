import { anchorState } from '@/lib/verdictAnchor';

// The recurring provenance mark. Its label is DERIVED from the anchor ledger, never
// hardcoded: this component previously read "hash-chained and timestamped to Bitcoin via
// OpenTimestamps" while nothing anchored the published verdicts at all, and it was one of
// nine surfaces that had to be corrected by hand once that was found. Deriving the label
// means the badge cannot outrun the evidence again - when the first Bitcoin attestation
// lands it upgrades itself, and if anchoring ever stops it downgrades itself.
export function ProvenanceBadge({ className = '' }: { className?: string }) {
  const state = anchorState();
  const label = state.kind === 'confirmed' ? 'bitcoin-anchored history' : 'hash-chained history';
  const title =
    state.kind === 'confirmed'
      ? `Verdict corpus anchored to Bitcoin block ${state.latestConfirmed.bitcoin?.block_heights?.[0]} via OpenTimestamps`
      : 'Verdict history is hash-chained; the Bitcoin attestation is not yet confirmed';
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-mute)] ${className}`}
      title={title}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="3" y="7" width="10" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="8" cy="10.4" r="1.1" fill="currentColor" />
      </svg>
      {label}
    </span>
  );
}
