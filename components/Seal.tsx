// The mcpindex seal: the bracket verdict inside a ring = a sealed, anchored
// verdict. The ring is not decoration - a sealed verdict is an anchored one
// (OpenTimestamps / Bitcoin), so the seal carries the provenance story. Used
// for round contexts (avatars, app icon) where the ring fills the frame
// edge-to-edge. Colors are props for DOM + Satori parity (see Mark).
export function Seal({
  size = 48,
  ring = 'currentColor',
  bracket = 'currentColor',
  token = 'var(--color-accent)',
}: {
  size?: number;
  ring?: string;
  bracket?: string;
  token?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="24" r="21" stroke={ring} strokeWidth="2.2" />
      <path d="M19 16 H15.5 V32 H19" stroke={bracket} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 16 H32.5 V32 H29" stroke={bracket} strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="19.4" y="22.3" width="9.2" height="3.4" rx="1.6" fill={token} />
    </svg>
  );
}
