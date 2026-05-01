import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How MCP Quality Score is calculated. Open methodology, open source, PR-friendly. Five dimensions over 100 points: freshness, completeness, installability, documentation, semver stability.',
};

export default function MethodologyPage() {
  return (
    <article className="mx-auto max-w-[820px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
        §01&nbsp;&nbsp;Methodology · v0
      </div>
      <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
        MCP Quality Score
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[--color-cite] max-w-[640px]">
        A 0–100 composite computed from public registry data only. No private telemetry, no
        opaque inputs. Source:{' '}
        <a
          href="https://github.com/mcpindex-ai/mcpindex-web/blob/main/lib/quality.ts"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]"
        >
          lib/quality.ts
        </a>
        . PRs welcome to refine weights or add signals.
      </p>

      <section className="mt-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
          §02&nbsp;&nbsp;Five dimensions
        </div>
        <ul className="rule-t">
          <Dim
            label="Freshness"
            max="0–25"
            body="Recency of the latest registry update. 25 if updated within 30 days, decays linearly to 0 by 365 days. Stale servers slip down even if otherwise complete."
          />
          <Dim
            label="Completeness"
            max="0–25"
            body="5 each for: distinct title (vs. raw name), description ≥50 chars, repository URL, website URL, and an icon. Penalizes drive-by registrations."
          />
          <Dim
            label="Installability"
            max="0–25"
            body="25 if the entry has any runnable path — npm/pypi/docker package OR a remote streamable-http/SSE URL. 0 otherwise. The single biggest signal of usable vs. theoretical."
          />
          <Dim
            label="Documentation"
            max="0–15"
            body="5 for repository present + 0–10 for env-var documentation coverage (every required env var has a description text). Servers without env vars get the full 10 by definition."
          />
          <Dim
            label="Stability"
            max="0–10"
            body="10 if the version is ≥1.0.0, 5 if 0.x, 0 if missing. Crude proxy for whether the author has shipped a stable contract."
          />
        </ul>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
          §03&nbsp;&nbsp;What it deliberately does NOT use
        </div>
        <ul className="space-y-3 text-[14.5px] leading-[1.6] text-[--color-cite]">
          <li><span className="text-[--color-accent] font-mono">·</span> GitHub stars (gameable, lagging, not in registry)</li>
          <li><span className="text-[--color-accent] font-mono">·</span> Download counts (no canonical source for MCP)</li>
          <li><span className="text-[--color-accent] font-mono">·</span> Sentiment from issues / discussions (noisy, biased)</li>
          <li><span className="text-[--color-accent] font-mono">·</span> Vendor pay-to-rank (never)</li>
        </ul>
        <p className="mt-6 text-[14px] text-[--color-cite] leading-[1.6]">
          When upstream data improves (e.g., the official registry adds a verified-by-vendor
          field), this score will absorb that signal. v1 may add: tool-count, last-commit
          activity (cached daily from public Git providers), and aggregate-error rate from
          the recommendation API itself.
        </p>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
          §04&nbsp;&nbsp;Cite this
        </div>
        <pre className="bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
          <code>{`Bharti, G. "MCP Quality Score." mcpindex.ai/methodology, 2026.
https://mcpindex.ai/methodology`}</code>
        </pre>
        <p className="mt-4 text-[13.5px] text-[--color-cite]">
          Or just{' '}
          <Link href="/leaderboard" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            link to a server&apos;s detail page
          </Link>{' '}
          — the score is rendered there with the breakdown.
        </p>
      </section>
    </article>
  );
}

function Dim({ label, max, body }: { label: string; max: string; body: string }) {
  return (
    <li className="rule-b grid grid-cols-[110px_60px_1fr] gap-4 py-5 px-2 items-baseline">
      <div className="font-mono text-[12.5px] uppercase tracking-[0.12em] text-[--color-ink]">
        {label}
      </div>
      <div className="font-mono text-[11px] text-[--color-mute] tabular-nums">{max}</div>
      <p className="text-[14px] leading-[1.55] text-[--color-cite]">{body}</p>
    </li>
  );
}
