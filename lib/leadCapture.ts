// Durable lead capture. The waitlist/enterprise routes email leads via Brevo, which
// is fail-soft — so before this module, a Brevo outage (revoked key, IP block, quota,
// downtime) meant an accepted lead existed ONLY as an ephemeral console.log line and was
// effectively lost (that is exactly what happened during the Brevo IP-allowlist outage).
//
// This appends every accepted lead to an Upstash list so it is durably recoverable
// regardless of Brevo's state. `delivery` records whether Brevo took it, so an operator
// can replay just the undelivered ones (see scripts/drain-leads.mjs).
//
// Fail-OPEN, exactly like lib/ratelimit: if Upstash is unconfigured or errors, we return
// false and the caller's console.log remains the last-resort trail — a Redis hiccup must
// never break a real visitor's submission.

import 'server-only'; // holds the Upstash REST token; never bundle to the client
import { Redis } from '@upstash/redis';
import { redisUrl, redisToken } from './env';

let _redis: Redis | null | undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = redisUrl();
  const token = redisToken();
  _redis = url && token ? new Redis({ url, token }) : null;
  return _redis;
}

/** TEST-ONLY seam (mirrors lib/ratelimit): override the shared client. `undefined` resets to
 * lazy env resolution, `null` forces the unconfigured (fail-open) path, a mock drives writes. */
export function __setLeadCaptureRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

/**
 * Redact an email for LOG output. Upstash (this module) and Brevo are the systems of record
 * for the plaintext; runtime logs are not, and anyone with project access or a configured log
 * drain can read them.
 *
 * Keeps the domain because that is the part with operational value ("someone from acme.com
 * signed up") and drops the local part, which is the identifying half. A hash was the other
 * option; it would need a salt to resist dictionary lookup of a known address space, and a new
 * required env var is a worse failure mode than a masked string that needs no configuration.
 *
 * Local parts of 1-2 chars are masked ENTIRELY rather than revealing a first initial that
 * would be most of the address.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***'; // not an address shape: reveal nothing
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.length > 2 ? local[0] : ''}***@${domain}`;
}

export const LEAD_CAPTURE_KEY = 'lead:capture';
const CAP = 10_000; // keep the most recent 10k leads; bounds Upstash memory (LTRIM after each push)

export type CapturedLead = {
  ts: string; // ISO submission time
  source: string; // contact | waitlist
  email: string;
  company?: string;
  message?: string;
  tier?: string;
  delivery: 'sent' | 'failed' | 'logged'; // whether Brevo took it (recovery filters on this)
};

/**
 * Durably append a lead to the Upstash capture list. Returns true if stored, false if the
 * store is unavailable (caller keeps its console.log fallback). Never throws.
 */
export async function captureLead(lead: CapturedLead): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  try {
    // Store as a JSON STRING (explicit): @upstash/redis auto-deserializes JSON on read, so
    // the drain script normalizes object-vs-string at the boundary.
    await r.lpush(LEAD_CAPTURE_KEY, JSON.stringify(lead));
    await r.ltrim(LEAD_CAPTURE_KEY, 0, CAP - 1);
    return true;
  } catch {
    return false; // fail-open
  }
}
