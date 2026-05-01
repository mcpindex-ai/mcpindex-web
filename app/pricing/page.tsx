import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free public API, optional Pro tier for higher rate limits, Enterprise for SLA.',
};

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    rate: '60 req/min/IP',
    blurb: 'For agents, hobby projects, and the open web.',
    bullets: [
      '60 req/min/IP across /api/v1/*',
      'Full search, recommend, diff endpoints',
      '/llms.txt + /.well-known/mcp-index.json',
      'mcp-server-mcpindex (npm) included',
      'Daily snapshot refresh',
    ],
    cta: { label: 'Use it now', href: '/api/v1/search?q=postgres' },
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
    cta: { label: 'Email to start', href: 'mailto:hello@mcpindex.ai?subject=Pro%20tier' },
  },
  {
    name: 'Enterprise',
    price: 'Contact',
    rate: 'Custom',
    blurb: 'For platforms that re-distribute MCP discovery.',
    bullets: [
      'Custom rate limit + SLA',
      'Self-hosted snapshot mirror',
      'Quality Score methodology customization',
      'Co-marketing on /best/ pages',
      'Acquisition discussions also welcome',
    ],
    cta: { label: 'Contact', href: 'mailto:hello@mcpindex.ai?subject=Enterprise' },
  },
];

export default function PricingPage() {
  return (
    <article className="mx-auto max-w-[1080px] px-6 sm:px-10 pt-16 pb-24">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
          §01&nbsp;&nbsp;Pricing
        </div>
        <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
          Free for the open web. Paid for the bandwidth.
        </h1>
        <p className="mt-4 max-w-[640px] text-[15.5px] leading-[1.55] text-[--color-cite]">
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
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
              {t.name}
            </div>
            <div className="mt-3 font-mono text-[28px] tabular-nums text-[--color-ink]">
              {t.price}
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-[--color-mute] tabular-nums">
              {t.rate}
            </div>
            <p className="mt-5 text-[14px] leading-[1.5] text-[--color-cite]">{t.blurb}</p>
            <ul className="mt-5 space-y-2 text-[13px] text-[--color-cite] flex-1">
              {t.bullets.map((b) => (
                <li key={b} className="flex gap-2">
                  <span className="text-[--color-accent] font-mono">·</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href={t.cta.href}
              className="mt-8 inline-block w-fit font-mono text-[12px] uppercase tracking-[0.16em] text-[--color-ink] border border-[--color-rule] px-3 py-1.5 hover:border-[--color-accent] hover:text-[--color-accent]"
            >
              {t.cta.label} →
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-10 font-mono text-[11.5px] text-[--color-mute]">
        v0 — paid tiers ship when waitlist clears 200. Until then, free tier covers everything
        you can call.
      </p>
    </article>
  );
}
