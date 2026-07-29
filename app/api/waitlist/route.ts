import { NextRequest, NextResponse } from 'next/server';
import {
  isBrevoConfigured,
  upsertLeadContact,
  notifyOperator,
  sendWelcomeEmail,
  type Lead,
  type LeadSource,
} from '@/lib/brevo';
import { checkLeadLimit } from '@/lib/ratelimit';
import { captureLead, maskEmail } from '@/lib/leadCapture';

function clientIp(req: NextRequest): string {
  // Vercel sets x-vercel-forwarded-for at the edge (client cannot forge it);
  // raw x-forwarded-for is the off-Vercel fallback only.
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Contact / list capture.
 * - Footer "Contact" (JSON + source=contact): Brevo contact lead + welcome + operator notify.
 * - Simple email-only forms: log-only update list (changelog RSS is the subscribe path).
 * Fail-soft: always logs; Brevo best-effort; never 500s the visitor when Brevo is down.
 */
/**
 * lib/leadCapture is deliberately fail-OPEN: if Upstash is unconfigured or erroring it returns
 * false, and its own comment names the caller's log line as the last-resort trail. That trail
 * is why the plaintext log existed at all, and it is worth keeping FOR THAT CASE ONLY - a
 * Brevo IP-allowlist outage already lost real leads once.
 *
 * So: redacted on every request (above), unredacted only when the lead would otherwise be
 * gone. Residual exposure is a hard crash in the microseconds between the two, which loses
 * the address from the log but not the submission.
 */
async function captureOrShout(lead: Parameters<typeof captureLead>[0]): Promise<void> {
  if (await captureLead(lead)) return;
  console.error(
    `[${lead.source}] LEAD CAPTURE FAILED - durable store unavailable, logging in full for ` +
      `manual recovery: ${JSON.stringify(lead)}`,
  );
}

export async function POST(req: NextRequest) {
  let email = '';
  let company = '';
  let message = '';
  let source: LeadSource = 'waitlist';

  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      company?: string;
      message?: string;
      source?: string;
    };
    email = body.email ?? '';
    company = (body.company ?? '').trim().slice(0, 200);
    message = (body.message ?? '').trim().slice(0, 2000);
    if (body.source === 'contact') {
      source = body.source;
    }
  } else {
    const form = await req.formData();
    email = String(form.get('email') ?? '');
  }

  email = email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }

  const ts = new Date().toISOString();
  // REDACTED trail. This line fires on every accepted submission, so it must not carry the
  // address: runtime logs are readable by anyone with project access or a configured log
  // drain, and they are not a system of record - Upstash (captureLead) and Brevo are.
  // `company` is caller-supplied free text up to 200 chars, so only its presence is logged;
  // the value itself is in both systems of record.
  console.log(`[${source}] ${ts} ${maskEmail(email)}` + (company ? ' company=yes' : ''));

  // Rich contact leads: Brevo when configured.
  if (source === 'contact') {
    const lead: Lead = {
      email,
      source,
      company: company || undefined,
      message: message || undefined,
    };
    if (isBrevoConfigured()) {
      // Gate BEFORE any outbound mail: this branch emails the caller-supplied address
      // and the operator. Rate-limit to stop email-bombing / operator-inbox flooding.
      const limit = await checkLeadLimit(clientIp(req), new Date());
      if (!limit.ok) {
        return Response.json(
          { error: 'rate_limited', scope: limit.reason },
          { status: 429, headers: { 'retry-after': limit.reason === 'global' ? '3600' : '60' } },
        );
      }
      const [contact, welcome, notify] = await Promise.all([
        upsertLeadContact(lead),
        sendWelcomeEmail(lead),
        notifyOperator(lead),
      ]);
      if (!contact.ok) console.warn(`[${source}] brevo contact upsert failed: ${contact.error}`);
      if (!welcome.ok) console.warn(`[${source}] brevo welcome failed: ${welcome.error}`);
      if (!notify.ok) console.warn(`[${source}] brevo operator notify failed: ${notify.error}`);
      // HONEST status: a configured-but-dead Brevo key (e.g. revoked -> every call 401s)
      // must NOT report 'sent'. If nothing got through, say 'failed' — the lead is still
      // in the server log above for manual recovery, and the caller isn't falsely told it
      // was delivered. Any one success still counts as 'sent'.
      const delivery = contact.ok || welcome.ok || notify.ok ? 'sent' : 'failed';
      // Durable capture regardless of Brevo outcome — a 'failed' lead is now recoverable
      // from Upstash, not just an ephemeral log line.
      await captureOrShout({ ts, source, email, company: company || undefined, message: message || undefined, delivery });
      return Response.json({ ok: true, delivery });
    }
    await captureOrShout({ ts, source, email, company: company || undefined, message: message || undefined, delivery: 'logged' });
    return Response.json({ ok: true, delivery: 'logged' });
  }

  // Plain waitlist: log only (RSS is the subscribe path) — still captured durably.
  await captureOrShout({ ts, source, email, company: company || undefined, delivery: 'logged' });
  if (!ct.includes('application/json')) {
    const url = new URL(req.url);
    url.pathname = '/';
    url.search = '?joined=1';
    return NextResponse.redirect(url, { status: 303 });
  }
  return Response.json({ ok: true, delivery: 'logged' });
}
