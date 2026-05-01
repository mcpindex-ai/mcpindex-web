'use client';

import { useEffect, useState, useRef, FormEvent } from 'react';

type Recommendation = {
  rank: number;
  slug: string;
  name: string;
  title: string;
  description: string;
  category: string;
  qualityScore: number;
  reasoning: string;
  installs: {
    npm?: string;
    pypi?: string;
    docker?: string;
    remote?: string;
  };
  url: string;
};

const HINTS = [
  'postgres with read-only mode',
  'scrape a website and save to S3',
  'search github and open a PR',
  'read pdfs from drive',
  'send slack messages on alert',
  'run sql against bigquery',
  'browse a webpage and summarize',
];

export function AgentDemo() {
  const [hintIndex, setHintIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Recommendation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (query) return;
    const id = setInterval(() => setHintIndex((i) => (i + 1) % HINTS.length), 2800);
    return () => clearInterval(id);
  }, [query]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const task = query.trim();
    if (!task) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/recommend?task=${encodeURIComponent(task)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setResults(json.recommendations ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }

  function pick(hint: string) {
    setQuery(hint);
    inputRef.current?.focus();
  }

  return (
    <div className="rule-t rule-b rule-l rule-r bg-[--color-accent-soft]/40">
      {/* Top strip: man-page header */}
      <div className="rule-b px-5 py-2.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em] text-[--color-mute]">
        <span>POST&nbsp;&nbsp;/api/v1/recommend</span>
        <span className="hidden sm:inline">live · no key required</span>
      </div>

      {/* Input row */}
      <form onSubmit={handleSubmit} className="px-5 py-6">
        <label className="block font-mono text-[11px] uppercase tracking-[0.16em] text-[--color-mute] mb-3">
          What would your agent ask?
        </label>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[--color-accent] text-lg select-none">▸</span>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder=""
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent font-mono text-[15px] sm:text-[17px] text-[--color-ink] placeholder-[--color-mute] outline-none"
              aria-label="Agent task description"
            />
            {!query && (
              <span
                className="pointer-events-none absolute left-0 top-0 font-mono text-[15px] sm:text-[17px] text-[--color-mute] truncate max-w-full"
                aria-hidden="true"
              >
                {HINTS[hintIndex]}
                <span className="caret-blink ml-0.5">▌</span>
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="font-mono text-[12px] uppercase tracking-[0.16em] text-[--color-ink] border border-[--color-rule] px-3 py-1.5 hover:border-[--color-accent] hover:text-[--color-accent] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'querying…' : 'recommend →'}
          </button>
        </div>

        {/* Hint chips */}
        {!results && !loading && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[--color-mute] mr-1 self-center">
              try
            </span>
            {HINTS.slice(0, 4).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => pick(h)}
                className="font-mono text-[11px] text-[--color-cite] border border-[--color-rule] bg-white px-2 py-0.5 hover:border-[--color-accent] hover:text-[--color-accent] transition-colors"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Results */}
      {(loading || results || error) && (
        <div className="rule-t bg-white">
          {loading && (
            <div className="px-5 py-8 font-mono text-[12px] text-[--color-mute]">
              <span className="text-[--color-accent]">▸</span> ranking 3,510 servers…
            </div>
          )}
          {error && (
            <div className="px-5 py-8 font-mono text-[12px] text-red-600">
              error: {error}
            </div>
          )}
          {results && results.length === 0 && !loading && (
            <div className="px-5 py-8 font-mono text-[12px] text-[--color-mute]">
              no matches — try broader phrasing.
            </div>
          )}
          {results && results.length > 0 && (
            <ul>
              {results.map((r) => (
                <ResultRow key={r.slug} r={r} />
              ))}
              <li className="rule-t px-5 py-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[--color-mute] flex justify-between">
                <span>response · ranked by composite score</span>
                <a
                  href={`/api/v1/recommend?task=${encodeURIComponent(query)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-[--color-accent]"
                >
                  view JSON →
                </a>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({ r }: { r: Recommendation }) {
  const install =
    r.installs.npm
      ? `npx -y ${r.installs.npm}`
      : r.installs.pypi
        ? `uvx ${r.installs.pypi}`
        : r.installs.docker
          ? `docker run --rm -i ${r.installs.docker}`
          : r.installs.remote
            ? r.installs.remote
            : 'manual install — see detail';
  return (
    <li className="rule-t first:border-t-0 px-5 py-5 hover:bg-[--color-accent-soft]/30 transition-colors group">
      <div className="grid grid-cols-[28px_1fr_auto] gap-4 items-baseline">
        <span className="font-mono text-[11px] text-[--color-mute] tabular-nums">
          [0{r.rank}]
        </span>
        <div className="min-w-0">
          <a
            href={r.url}
            className="block font-medium text-[15px] text-[--color-ink] group-hover:text-[--color-accent] transition-colors truncate"
          >
            {r.title}
          </a>
          <div className="mt-0.5 font-mono text-[11px] text-[--color-mute] truncate">
            {r.name}
            <span className="mx-2 text-[--color-rule]">·</span>
            {r.category}
          </div>
          <p className="mt-2 text-[13px] text-[--color-cite] leading-snug">
            {r.reasoning}
          </p>
          <pre className="mt-3 overflow-x-auto bg-[--color-ink] text-zinc-100 px-3 py-2 font-mono text-[11.5px]">
            <code>$ {install}</code>
          </pre>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[--color-mute]">
            QS
          </div>
          <div className="font-mono text-[22px] tabular-nums text-[--color-ink] leading-none mt-1">
            {r.qualityScore}
          </div>
          <div className="font-mono text-[10px] text-[--color-mute] mt-0.5">/100</div>
        </div>
      </div>
    </li>
  );
}
