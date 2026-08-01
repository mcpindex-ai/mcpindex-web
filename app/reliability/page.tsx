import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  image: '/opengraph-image',
  title: 'Reliability: what fails open, what fails closed',
  description:
    'Per-surface failure semantics for mcpindex. The gate decision path runs locally and fails closed; hosted surfaces enrich but never decide. Verified against the shipped SDK source, with the 2026-08-01 control-plane outage as the live test.',
  path: '/reliability',
});

// A surface row: name, decision-path fact, what its failure does.
type Surface = {
  name: string;
  path: string;
  onFailure: string;
};

const SURFACES: Surface[] = [
  {
    name: 'Drift gate (SDK / interceptor)',
    path: 'Local. No network call on the decision path - the gate compares the pinned contract hash against the live server, on your machine.',
    onFailure:
      'Fails closed. A scan, diff, or validation error on a drifted contract returns HOLD, never PROCEED. failOpen exists as an explicit opt-in and stamps every verdict it touches with failOpenWarning.',
  },
  {
    name: 'Pin store',
    path: 'Local file. Carries the public contract hash and optional public schema - never a token or credential, by construction.',
    onFailure:
      'A missing pinned schema reads as "nothing to compare against" and holds - it does not silently pass.',
  },
  {
    name: 'Fleet drift advisories',
    path: 'Network read from mcpindex.ai. Advisory only: rides alongside a decision.',
    onFailure:
      'Fails open by design - an unreachable advisory feed never converts a decision in either direction. It enriches; it does not decide.',
  },
  {
    name: 'Hosted APIs (/api/mcp, preflight, screen)',
    path: 'Network. Discovery, screening, and hosted verdict lookups.',
    onFailure:
      'Unavailable means unavailable - an error, not a synthetic verdict. No surface fabricates a PROCEED or a PASS while the control plane is down.',
  },
  {
    name: 'Badges',
    path: 'Served by the hosted API with a 5-minute cache and a verdict expiry stamp.',
    onFailure:
      'An outage renders a broken image, not a stale green. A verdict past its expiry renders "stale" even while everything is up - the badge never overstates how fresh the evidence is.',
  },
  {
    name: 'Ambient notice + drift telemetry',
    path: 'Ambient notice writes one line to stderr, first touch per tool - never stdout, never the agent channel, no argument values. Telemetry is off by default (zero egress) until MCPINDEX_DRIFT_TELEMETRY is set.',
    onFailure:
      'Nothing to fail: neither can alter a gate decision, and neither sends anything you did not turn on.',
  },
];

export default function ReliabilityPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Reliability
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        What fails open, what fails closed.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        When mcpindex infrastructure fails, gate decisions do not change. The
        decision path runs locally on your machine and fails closed; the hosted
        side enriches decisions but never makes them. That is a design boundary,
        not a promise - each surface below states exactly what its failure does,
        and each claim is checkable in the shipped SDK source.
      </p>

      <div className="mt-10 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        Per-surface semantics
      </div>
      <ul className="rule-t">
        {SURFACES.map((s) => (
          <li key={s.name} className="rule-b py-6 px-2">
            <div className="text-[15px] font-medium text-[var(--color-ink)]">{s.name}</div>
            <p className="mt-2 text-[14px] leading-[1.6] text-[var(--color-cite)]">{s.path}</p>
            <p className="mt-2 text-[14px] leading-[1.6] text-[var(--color-cite)]">
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                on failure ·{' '}
              </span>
              {s.onFailure}
            </p>
          </li>
        ))}
      </ul>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          The live test
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          On 2026-08-01 the hosting platform disabled this site&apos;s deployments
          for 3h40m (a usage-cap event; details in the{' '}
          <Link href="/status" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            incident log
          </Link>
          ). Every hosted surface above was unreachable. No gate decision
          changed, no badge rendered a false pass, and installed SDKs kept
          enforcing their pins offline - the failure behaved exactly as this
          page says it should. Semantics on this page were last verified against
          the SDK source on 2026-08-01.
        </p>
      </section>

      <p className="mt-10 font-mono text-[12px] text-[var(--color-mute)]">
        Live uptime at{' '}
        <a
          href="https://stats.uptimerobot.com/BmOwSpYXOj"
          className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          the external status page
        </a>
        {' · '}
        <Link href="/trust" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          trust model
        </Link>
        {' · '}
        <Link href="/methodology" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
          methodology
        </Link>
      </p>
    </article>
  );
}
