import { loadSnapshot, loadServers } from '@/lib/registry';
import { daysAgoCutoff, timeAgo } from '@/lib/time';

export async function LiveTicker() {
  const [snap, servers] = await Promise.all([loadSnapshot(), loadServers()]);
  // Servers added in the last 7 days from the snapshot.
  const weekAgo = daysAgoCutoff(7);
  const fresh = servers.filter((s) => new Date(s.publishedAt).getTime() > weekAgo).length;

  return (
    <div className="rule-b">
      <div className="site-container py-2 flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)] overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] live-dot" aria-hidden />
          <span>Live</span>
        </div>
        <div className="hidden md:flex items-center gap-6 truncate">
          <span>
            Snapshot <span className="text-[var(--color-cite)]">{timeAgo(snap.fetchedAt)}</span>
          </span>
          <span>
            Tracking <span className="text-[var(--color-cite)] tabular-nums">{servers.length.toLocaleString()}</span>
          </span>
          <span>
            7-day delta <span className="text-[var(--color-accent)] tabular-nums">+{fresh}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a href="/changelog" className="hover:text-[var(--color-accent)]">/changelog</a>
          <a href="/api/registry-count" className="hidden sm:inline hover:text-[var(--color-accent)]">
            /api/registry-count
          </a>
        </div>
      </div>
    </div>
  );
}
