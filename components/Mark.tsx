// The mcpindex mark: the bracket verdict. Square brackets (an index entry, a
// checkbox verdict, a gate) holding the amber decision token. The token is the
// brand atom; the bracket is the logo; the Seal and the Verdict Card are the
// same idea at larger scales.
//
// Colors are props so the same component renders in the DOM (currentColor +
// the accent CSS var) and inside next/og / Satori (explicit hex, since CSS
// vars do not resolve there).
export function Mark({
  size = 20,
  bracket = 'currentColor',
  token = 'var(--color-accent)',
}: {
  size?: number;
  bracket?: string;
  token?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M15 8 H10 V32 H15" stroke={bracket} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 8 H30 V32 H25" stroke={bracket} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="15" y="18.2" width="10" height="3.6" rx="1.6" fill={token} />
    </svg>
  );
}
