import { loadSnapshot, loadServers } from '@/lib/registry';

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export async function LiveTicker() {
  const [snap, servers] = await Promise.all([loadSnapshot(), loadServers()]);
  // Servers added in the last 7 days from the snapshot.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const fresh = servers.filter((s) => new Date(s.publishedAt).getTime() > weekAgo).length;

  return (
    <div className="rule-b">
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-2 flex items-center justify-between gap-4 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[--color-mute] overflow-hidden">
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[--color-accent] live-dot" aria-hidden />
          <span>Live</span>
        </div>
        <div className="hidden md:flex items-center gap-6 truncate">
          <span>
            Snapshot <span className="text-[--color-cite]">{timeAgo(snap.fetchedAt)}</span>
          </span>
          <span>
            Indexed <span className="text-[--color-cite] tabular-nums">{servers.length.toLocaleString()}</span>
          </span>
          <span>
            7-day delta <span className="text-[--color-accent] tabular-nums">+{fresh}</span>
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <a href="/changelog" className="hover:text-[--color-accent]">/changelog</a>
          <a href="/api/registry-count" className="hidden sm:inline hover:text-[--color-accent]">
            /api/registry-count
          </a>
        </div>
      </div>
    </div>
  );
}
