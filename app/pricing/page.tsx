import type { Metadata } from 'next';
import { TierCTA, type Cta } from './pricing-cta';
import { EnterpriseCTA } from '@/components/EnterpriseCTA';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'The in-path gate is free, local, and open-core. Pro adds the cloud tier-1 corpus lookup and a higher-rate trust API. Enterprise is the multi-tenant in-path gateway.',
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

// Structured around the PLATFORM, gate-first (the wedge). Free = the gate itself
// (local, open-core, all postures, zero custody). Pro = the optional cloud tier-1
// corpus lookup + a higher-rate trust API. Enterprise = the multi-tenant in-path
// gateway (built but held off by default behind an explicit flag — so it is sold
// "on request", not advertised as a flipped-on default). Directory/trust API
// limits are a secondary block below.
const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    rate: 'local · open-core',
    blurb: 'The in-path gate, for every developer.',
    bullets: [
      'One-click install (Claude Desktop / Cursor / Cline / Zed)',
      'TS + Python SDK (wrap an authenticated session)',
      'All postures: Monitor / Guard / Strict',
      'Deterministic tier-0 contract-diff, runs locally',
      'Zero credential custody · default build egresses nothing',
    ],
    cta: { label: 'Install the gate', href: '/docs#install-the-gate' },
  },
  {
    name: 'Pro',
    price: '$49 / mo',
    rate: '600 req/min/key',
    blurb: 'For teams shipping agents in production.',
    bullets: [
      'Everything in Free',
      'Opt-in cloud tier-1 corpus lookup (sends only a contract hash)',
      'Trust API at 600 req/min per key',
      'Webhook on registry diff',
      'Email support',
    ],
    cta: { label: 'Get Pro access', contact: 'pro' },
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
    <article className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Pricing
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          The gate is free. The network is paid.
        </h1>
        <p className="mt-4 max-w-[660px] text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          The in-path gate you install is free, local, and open-core &mdash; all postures, the SDK,
          and zero credential custody. Paid tiers add the optional cloud tier-1 corpus lookup, a
          higher-rate trust API, and the multi-tenant gateway.
        </p>
        <p className="mt-3 max-w-[660px] text-[14px] leading-[1.55] text-[var(--color-mute)]">
          To be clear about what is paywalled: the gate&rsquo;s protection &mdash; the
          deterministic tier-0 contract-diff &mdash; is fully functional on Free, runs locally, and
          is unmetered. The cloud tier-1 corpus lookup is held off by default and opt-in; Pro is
          how you turn it on, plus a higher-rate trust API (600 req/min/key; the free directory API
          is 60 req/min/IP). Protection is never behind the paywall.
        </p>
      </header>

      <div className="mt-12 grid sm:grid-cols-3 rule-t rule-b rule-l rule-r">
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

      <div className="mt-12 rule-t pt-8 max-w-[760px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
          The directory & trust API (secondary)
        </div>
        <p className="text-[14px] leading-[1.6] text-[var(--color-cite)]">
          The advisory directory the gate queries also stands alone. The public API and the{' '}
          <code className="font-mono text-[13px] text-[var(--color-ink)]">mcp-server-mcpindex</code>{' '}
          npm package are free at 60 req/min/IP, no key required: trust verdicts
          (/api/v1/trust), live screening (/api/v1/screen), search, recommend, and diff, plus
          /llms.txt and /.well-known/mcp-index.json. Higher rate limits ride the Pro key above.
        </p>
      </div>

      <p className="mt-10 font-mono text-[11.5px] text-[var(--color-mute)] max-w-[760px]">
        Free covers everything you can call, no key required. Pro and Enterprise provisioning is
        manual today &mdash; request access above and we set you up. Enterprise multi-tenant is
        available on request (it is built but not the default deployment).
      </p>

      <div className="mt-14">
        <EnterpriseCTA />
      </div>
    </article>
  );
}
