'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// Client search widget over GET /api/v1/search. Debounced, abortable, fail-soft. Each result links
// to /server/[slug] (where the trust verdict + maturity score live) - so this is a navigation funnel
// into the indexed server pages, not a results page meant to be indexed itself.

interface Result {
  slug: string;
  name: string;
  title?: string;
  description?: string;
  category: string;
  qualityScore: number;
}

type State = 'idle' | 'loading' | 'done' | 'error';

export function ServerSearch({ initialQuery = '' }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<Result[]>([]);
  const [state, setState] = useState<State>(initialQuery.trim().length >= 2 ? 'loading' : 'idle');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // All state writes live inside the debounce timer (deferred, not synchronous in the effect
    // body) so a query change never triggers a same-tick re-render.
    const query = q.trim();
    const t = setTimeout(() => {
      if (query.length < 2) {
        setResults([]);
        setState('idle');
        return;
      }
      setState('loading');
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      fetch(`/api/v1/search?q=${encodeURIComponent(query)}&limit=20`, { signal: ctl.signal })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: { results?: Result[] }) => {
          setResults(Array.isArray(data.results) ? data.results : []);
          setState('done');
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') setState('error');
        });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="mt-8">
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="server-search" className="sr-only">
          Search MCP servers by name, category, or keyword
        </label>
        <input
          id="server-search"
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, category, or keyword…"
          aria-describedby="server-search-status"
          className="w-full rounded-md border border-[var(--color-rule)] bg-white px-4 py-3 text-[15px] text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
        />
      </form>

      <p
        id="server-search-status"
        aria-live="polite"
        className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]"
      >
        {state === 'idle' && q.trim().length === 0 && 'Type at least 2 characters'}
        {state === 'idle' && q.trim().length === 1 && 'Keep typing…'}
        {state === 'loading' && 'Searching…'}
        {state === 'error' && 'Search is unavailable right now - try again shortly.'}
        {state === 'done' && `${results.length} result${results.length === 1 ? '' : 's'}`}
      </p>

      {state === 'done' && results.length === 0 && (
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          No servers matched. Try a broader term, or browse{' '}
          <Link href="/best" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            by category
          </Link>{' '}
          or the{' '}
          <Link href="/leaderboard" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            maturity rankings
          </Link>
          .
        </p>
      )}

      {results.length > 0 && (
        <ul className="mt-6 rule-t">
          {results.map((r) => (
            <li key={r.slug} className="rule-b">
              <Link href={`/server/${r.slug}`} className="block py-4 px-2 hover:bg-[#fafaf9]">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[15.5px] font-medium text-[var(--color-ink)]">{r.name}</span>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)] tabular-nums">
                    {r.category} · {r.qualityScore}/100
                  </span>
                </div>
                {r.description && (
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-[1.5] text-[var(--color-cite)]">
                    {r.description}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
