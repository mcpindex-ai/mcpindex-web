import type { Metadata } from 'next';
import { TierCTA, type Cta } from './pricing-cta';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free public API, optional Pro tier for higher rate limits, Enterprise for SLA.',
};

type Tier = {
  name: string;
  price: string;
  rate: string;
  blurb: string;
  bullets: string[];
  cta: Cta;
};

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '$0',
    rate: '60 req/min/IP',
    blurb: 'For agents, hobby projects, and the open web.',
    bullets: [
      'Trust verdict API: /api/v1/trust/tool & /server',
      'Screen any tool description (live LLM judge)',
      'Search, recommend, diff endpoints',
      'mcp-server-mcpindex (npm) included',
      '/llms.txt + /.well-known/mcp-index.json',
    ],
    cta: { label: 'Screen a tool', href: '/screen' },
  },
  {
    name: 'Pro',
    price: '$49 / mo',
    rate: '600 req/min/key',
    blurb: 'For teams shipping agents in production.',
    bullets: [
      'Everything in Free',
      '600 req/min per API key',
      'Priority cache (sub-100ms p95)',
      'Webhook on registry diff',
      'Email support',
    ],
    cta: { label: 'Get Pro access', contact: 'pro' },
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    rate: 'Custom',
    blurb: 'For platforms that re-distribute MCP discovery.',
    bullets: [
      'Custom rate limit + SLA',
      'Self-hosted snapshot mirror',
      'Quality Score methodology customization',
      'Co-marketing on /best/ pages',
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
          Free for the open web. Paid for the bandwidth.
        </h1>
        <p className="mt-4 max-w-[640px] text-[15.5px] leading-[1.55] text-[var(--color-cite)]">
          The public API and the npm package are free. Paid tiers exist for teams that need
          guaranteed throughput.
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

      <p className="mt-10 font-mono text-[11.5px] text-[var(--color-mute)]">
        v0 - paid tiers ship when waitlist clears 200. Until then, free tier covers everything
        you can call.
      </p>
    </article>
  );
}
