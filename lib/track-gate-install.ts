'use client';

import { track } from '@vercel/analytics';

/** Fire-and-forget install-copy signal (Vercel Analytics + log beacon). */
export function trackGateInstallCopy(source: string) {
  const src = source.slice(0, 64);
  try {
    track('gate_install_copy', { source: src });
  } catch {
    /* Analytics may be blocked; beacon still runs */
  }
  try {
    void fetch('/api/beacon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'gate_install_copy', source: src }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}
