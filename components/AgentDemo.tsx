'use client';

import { useEffect, useState, useRef, FormEvent } from 'react';
import type { Verdict, Decision } from '@/lib/verdicts';
import { VerdictCard } from './VerdictCard';

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

type Preflight = {
  recommendations: Recommendation[];
  screened_for: string | null;
  verdict: Verdict | null;
};

// The first four (shown as chips) are curated so rank-1 is BOTH a real, topical
// server AND has a verdict on file. The last is the lone weak case: "save TO s3"
// is a compound intent where the secondary noun loses to the primary verb, so it
// stays off the chip row. Freeform queries still work and show NOT SCREENED
// honestly. See tasks/todo-mcpindex-verdict-demo.md.
const HINTS = [
  'search github and open a PR',
  'read pdfs from drive',
  'send slack messages on alert',
  'run sql against a database',
  'browse a webpage and summarize',
  'scrape a website and save to S3',
];

const DECISION_CLS: Record<Decision, string> = {
  ALLOW: 'text-emerald-700',
  DENY: 'text-red-700',
  REVIEW: 'text-amber-700',
};

export function AgentDemo({
  serverCount,
  screenedCount,
}: {
  serverCount?: number;
  screenedCount?: number;
}) {
  const [hintIndex, setHintIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [data, setData] = useState<Preflight | null>(null);
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
      const res = await fetch(`/api/v1/preflight?task=${encodeURIComponent(task)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as Preflight;
      setData(json);
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

  const results = data?.recommendations ?? null;
  const top = results && results.length > 0 ? results[0] : null;

  return (
    <div className="rule-t rule-b rule-l rule-r bg-[var(--color-accent-soft)]/40">
      {/* Top strip: man-page header */}
      <div className="rule-b px-5 py-2.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
        <span>find&nbsp;→&nbsp;verify</span>
        <span className="hidden sm:inline">live · no key required</span>
      </div>

      {/* Input row */}
      <form onSubmit={handleSubmit} className="px-5 py-6">
        <label className="block font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)] mb-3">
          What would your agent ask?
        </label>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[var(--color-accent)] text-lg select-none">▸</span>
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder=""
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-transparent font-mono text-[15px] sm:text-[17px] text-[var(--color-ink)] placeholder-[var(--color-mute)] outline-none"
              aria-label="Agent task description"
            />
            {!query && (
              <span
                className="pointer-events-none absolute left-0 top-0 font-mono text-[15px] sm:text-[17px] text-[var(--color-mute)] truncate max-w-full"
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
            className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-ink)] border border-[var(--color-rule)] px-3 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'checking…' : 'recommend →'}
          </button>
        </div>

        {/* Hint chips */}
        {!data && !loading && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)] mr-1 self-center">
              try
            </span>
            {HINTS.slice(0, 4).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => pick(h)}
                className="font-mono text-[11px] text-[var(--color-cite)] border border-[var(--color-rule)] bg-white px-2 py-0.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                {h}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Results */}
      {(loading || data || error) && (
        <div className="rule-t bg-white">
          {loading && (
            <div className="px-5 py-8 font-mono text-[12px] text-[var(--color-mute)]">
              <span className="text-[var(--color-accent)]">▸</span> ranking{' '}
              {serverCount ? serverCount.toLocaleString() : 'all'} servers, then reading the verdict…
            </div>
          )}
          {error && (
            <div className="px-5 py-8 font-mono text-[12px] text-red-600">error: {error}</div>
          )}
          {results && results.length === 0 && !loading && (
            <div className="px-5 py-8 font-mono text-[12px] text-[var(--color-mute)]">
              no matches - try broader phrasing.
            </div>
          )}
          {results && results.length > 0 && (
            <>
              <ul>
                {results.map((r) => (
                  <ResultRow key={r.slug} r={r} />
                ))}
                <li className="rule-t px-5 py-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                  discovery · ranked by composite score
                </li>
              </ul>

              {/* The payoff: discovery hands off to the trust gate for rank-1. */}
              {top && (
                <VerdictGate
                  top={top}
                  verdict={data?.verdict ?? null}
                  screenedCount={screenedCount}
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function VerdictGate({
  top,
  verdict,
  screenedCount,
}: {
  top: Recommendation;
  verdict: Verdict | null;
  screenedCount?: number;
}) {
  const decision = verdict?.directive.decision ?? null;
  return (
    <div className="rule-t bg-[var(--color-accent-soft)]/30 px-5 py-6">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-3">
        before your agent connects <span className="text-[var(--color-ink)]">[01] {top.name}</span>
      </div>

      {/* Contrast: a directory stops at the score; the verdict is the next question. */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[12px]">
        <span className="text-[var(--color-mute)]">
          directory rank <span className="text-[var(--color-ink)] tabular-nums">QS {top.qualityScore}</span>
        </span>
        <span className="text-[var(--color-rule)]">·</span>
        <span className="text-[var(--color-mute)]">
          mcpindex verdict{' '}
          <span className={decision ? DECISION_CLS[decision] : 'text-stone-500'}>
            {decision ?? 'NOT SCREENED'}
          </span>
        </span>
      </div>

      {verdict ? (
        <VerdictCard verdict={verdict} />
      ) : (
        <NotScreened />
      )}

      {/* Coverage honesty + adoption hook. */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {typeof screenedCount === 'number' && (
          <span className="font-mono text-[10.5px] text-[var(--color-mute)]">
            <span className="text-[var(--color-ink)] tabular-nums">{screenedCount.toLocaleString()}</span>{' '}
            servers screened, growing
          </span>
        )}
        <CopyEndpoint slug={top.slug} />
      </div>
    </div>
  );
}

function NotScreened() {
  return (
    <div className="rule-t rule-b rule-l rule-r bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center border border-stone-300 bg-stone-50 px-3 py-1.5 font-mono text-[15px] font-medium tracking-wide text-stone-500">
          NOT SCREENED
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          fail-closed
        </span>
      </div>
      <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-cite)] max-w-[640px]">
        We have not screened this server yet, so there is no verdict to trust. The honest default is
        to treat it as not-cleared and fall back to your own checks - never green by absence.
      </p>
    </div>
  );
}

function CopyEndpoint({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  // Adoption hook points at the PUBLIC, stable trust endpoint - the surface an
  // agent should actually call - not the internal preflight BFF.
  const endpoint = `GET /api/v1/trust/server/${slug}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://mcpindex.ai/api/v1/trust/server/${slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - the visible string is still selectable */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy the trust endpoint your agent can call before acting"
      className="group inline-flex items-center gap-2 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-3 py-2 font-mono text-[11.5px] hover:opacity-90 transition-opacity"
    >
      <span className="whitespace-nowrap">$ {endpoint}</span>
      <span className="shrink-0 text-zinc-400 group-hover:text-zinc-200">
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
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
            : 'manual install - see detail';
  return (
    <li className="rule-t first:border-t-0 px-5 py-5 hover:bg-[var(--color-accent-soft)]/30 transition-colors group">
      <div className="grid grid-cols-[28px_1fr_auto] gap-4 items-baseline">
        <span className="font-mono text-[11px] text-[var(--color-mute)] tabular-nums">
          [0{r.rank}]
        </span>
        <div className="min-w-0">
          <a
            href={r.url}
            className="block font-medium text-[15px] text-[var(--color-ink)] group-hover:text-[var(--color-accent)] transition-colors truncate"
          >
            {r.title}
          </a>
          <div className="mt-0.5 font-mono text-[11px] text-[var(--color-mute)] truncate">
            {r.name}
            <span className="mx-2 text-[var(--color-rule)]">·</span>
            {r.category}
          </div>
          <p className="mt-2 text-[13px] text-[var(--color-cite)] leading-snug">
            {r.reasoning}
          </p>
          <pre className="mt-3 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-3 py-2 font-mono text-[11.5px]">
            <code>$ {install}</code>
          </pre>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
            QS
          </div>
          <div className="font-mono text-[22px] tabular-nums text-[var(--color-ink)] leading-none mt-1">
            {r.qualityScore}
          </div>
          <div className="font-mono text-[10px] text-[var(--color-mute)] mt-0.5">/100</div>
        </div>
      </div>
    </li>
  );
}
