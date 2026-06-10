// Shared relative-time formatter. Used by the live ticker and the status page
// so the "Xm/Xh/Xd ago" wording stays identical across surfaces.
export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Epoch-ms cutoff for "N days ago" — used to count recently-added servers.
 * Kept out of component bodies so the React Compiler purity lint doesn't flag
 * Date.now() in render: async server components run once per request, so the
 * call is correct here; the rule just can't tell a component from an RSC. */
export function daysAgoCutoff(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
