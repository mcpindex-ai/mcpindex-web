import type { Metadata } from 'next';
import { TierCTA, type Cta } from './pricing-cta';
import { EnterpriseCTA } from '@/components/EnterpriseCTA';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'The entire platform is free: the in-path gate, the SDK, the drift network, and the directory & trust API. Enterprise is a custom-deployed, multi-tenant gateway, priced by request.',
  alternates: { canonical: 'https://mcpindex.ai/pricing' },
};

type Tier = {
  name: string;
  price: string;
  rate: string;
  blurb: string;
  bullets: string[];
  cta: Cta;
};

// Structured around the PLATFORM, gate-first (the wedge). Free = everything a
// developer can install or call: the gate (local, open-core, all postures, zero
// custody), the opt-in cloud tier-1 corpus lookup, and the directory & trust API
// — no key, no tier. There was a Pro tier; it is gone, not renamed. Its bearer-
// key/600-req-min mechanism was never implemented in code, so folding it into
// Free costs nothing real and removes a stale claim. Enterprise stays a genuine
// contact tier: the multi-tenant in-path gateway is real infra + support work
// (self-host or managed, SLA, DPA), not a feature we were holding back.
const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    rate: '60 req/min/IP',
    blurb: 'The whole platform, for every developer.',
    bullets: [
      'One-click install (Claude Desktop / Cursor / Cline / Zed)',
      'TS + Python SDK (wrap an authenticated session)',
      'All postures: Monitor / Guard / Strict',
      'Deterministic tier-0 contract-diff, runs locally',
      'Opt-in cloud tier-1 corpus lookup, the drift network, and the public ledger',
      'Directory & trust API — search, recommend, screen, diff — no key required',
      'Zero credential custody · default build egresses nothing',
    ],
    cta: { label: 'Install the gate', href: '/docs#install-the-gate' },
  },
  {
    name: 'Enterprise',
    price: 'Contact',
    rate: 'Custom',
    blurb: 'The multi-tenant in-path gateway.',
    bullets: [
      'Multi-tenant gateway: per-tenant isolation, posture, and audit',
      'Self-host or managed; zero-egress by default',
      'SLA + DPA on request; sub-processor list',
      'Custom rate limit + priority support',
      'Acquisition discussions also welcome',
    ],
    cta: { label: 'Contact sales', contact: 'enterprise' },
  },
];

export default function PricingPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Pricing
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          The gate is free. So is everything else.
        </h1>
        <p className="mt-4 text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          The in-path gate you install is free, local, and open-core &mdash; all postures, the SDK,
          zero credential custody, and the opt-in drift network: crawler-corroborated advisories
          that warn you on call 1, plus the public drift ledger. The optional cloud tier-1 corpus
          lookup (a contract judged once clears or condemns it everywhere) and the directory &amp;
          trust API are free too, no key, no tier. Enterprise is the one thing you contact us for
          &mdash; a custom-deployed, multi-tenant gateway with an SLA &mdash; because that is real
          hosting and support work, not a feature we were holding back.
        </p>
        <p className="mt-3 text-[14px] leading-[1.55] text-[var(--color-mute)]">
          The only ceiling is abuse protection, not payment. The public API is capped at 60
          requests/min per IP; the LLM-backed screener carries its own tighter, cost-bounded limit
          (10/min/IP, 5,000 calls/day globally) so a flood can&rsquo;t run up our bill &mdash; a
          circuit breaker, not a paywall. If a real integration genuinely needs more than that,
          email hello@mcpindex.ai.
        </p>
      </header>

      <div className="mt-12 grid sm:grid-cols-2 rule-t rule-b rule-l rule-r">
        {TIERS.map((t, i) => (
          <div
            key={t.name}
            className={`p-6 sm:p-8 ${i > 0 ? 'rule-l' : ''} flex flex-col`}
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
              {t.name}
            </div>
            <div className="mt-3 font-mono text-[28px] tabular-nums text-[var(--color-ink)]">
              {t.price}
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-[var(--color-mute)] tabular-nums">
              {t.rate}
            </div>
            <p className="mt-5 text-[14px] leading-[1.5] text-[var(--color-cite)]">{t.blurb}</p>
            <ul className="mt-5 space-y-2 text-[13px] text-[var(--color-cite)] flex-1">
              {t.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="text-[var(--color-accent)] font-mono">·</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <TierCTA cta={t.cta} />
          </div>
        ))}
      </div>

      <div className="mt-12 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
          The directory & trust API (secondary)
        </div>
        <p className="text-[14px] leading-[1.6] text-[var(--color-cite)]">
          The advisory directory the gate queries also stands alone. The public API and the{' '}
          <code className="font-mono text-[13px] text-[var(--color-ink)]">mcp-server-mcpindex</code>{' '}
          npm package are free at 60 req/min/IP, no key required: trust verdicts
          (/api/v1/trust), live screening (/api/v1/screen), search, recommend, and diff, plus
          /llms.txt and /.well-known/mcp-index.json. Same limit, same terms, for everyone.
        </p>
      </div>

      <p className="mt-10 font-mono text-[11.5px] text-[var(--color-mute)]">
        Free covers everything on this page, no key required. Enterprise provisioning is manual
        today &mdash; request access above and we set you up. Enterprise multi-tenant is built but
        not the default deployment, which is why it&rsquo;s on request rather than self-serve.
      </p>

      <div className="mt-14">
        <EnterpriseCTA />
      </div>
    </article>
  );
}
