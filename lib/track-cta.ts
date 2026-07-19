'use client';

import { track } from '@vercel/analytics';

/** Fire-and-forget CTA-click signal (Vercel Analytics + log beacon). The aggregate
 * click-to-install ratio divides weekly new installs by these clicks + install copies,
 * so every conversion CTA must fire exactly one event per click. */
export function trackCtaClick(source: string) {
  const src = source.slice(0, 64);
  try {
    track('gate_cta_click', { source: src });
  } catch {
    /* Analytics may be blocked; beacon still runs */
  }
  try {
    void fetch('/api/beacon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'gate_cta_click', source: src }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
