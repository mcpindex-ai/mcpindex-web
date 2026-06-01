// The mcpindex mark: a miniature Verdict Card. A bordered frame (the card),
// an amber decision token (top-left), and two dimension rows beneath. The
// brand object propagated down to a glyph. currentColor = ink; the token
// uses the accent so the mark carries the one reserved color, like the card.
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect x="1.5" y="1.5" width="17" height="17" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="5" y="4.8" width="6.2" height="3.2" rx="0.8" fill="var(--color-accent)" />
      <line x1="5" y1="11.6" x2="15" y2="11.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="5" y1="14.4" x2="12" y2="14.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
