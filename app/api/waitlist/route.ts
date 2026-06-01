import { NextRequest, NextResponse, after } from 'next/server';
import { checkWaitlistLimit } from '@/lib/ratelimit';
import {
  isBrevoConfigured,
  upsertLeadContact,
  sendWelcomeEmail,
  notifyOperator,
  type Lead,
  type LeadTier,
} from '@/lib/brevo';

// One lead pipeline for BOTH the homepage waitlist (form-encoded) and the
// /pricing Pro/Enterprise modals (JSON). For every lead: validate -> rate-limit
// -> log (always, audit + safety net) -> push to Brevo (contact into the leads
// list, single opt-in welcome to the subscriber, notification to the operator).
// The Brevo fan-out runs in after() so it never blocks the visitor's response,
// and is best-effort: if Brevo is unconfigured or down, the lead is still logged
// and the visitor still gets success - a lead is never lost. Inspect logs in
// Vercel dashboard -> Project -> Logs, filter for [waitlist].
export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_COMPANY = 120;
const MAX_MESSAGE = 2000;

// Strip CR/LF (log-line injection) and clamp length.
function clean(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Best-effort Brevo fan-out; failures are logged, never surfaced to the visitor.
async function pushToBrevo(lead: Lead) {
  if (!isBrevoConfigured()) {
    console.warn('[waitlist] BREVO_API_KEY not set - lead logged only, not sent to Brevo');
    return;
  }
  const names = ['contact', 'welcome', 'notify'] as const;
  const results = await Promise.allSettled([
    upsertLeadContact(lead),
    sendWelcomeEmail(lead),
    notifyOperator(lead),
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[waitlist] brevo ${names[i]} threw:`, r.reason instanceof Error ? r.reason.name : 'rejected');
    } else if (!r.value.ok) {
      console.error(`[waitlist] brevo ${names[i]} failed: ${r.value.error}`);
    }
  });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? '';
  const isJson = ct.includes('application/json');

  // Parse first so the rate limiter can bucket by source (paid vs free).
  let email = '';
  let tier: LeadTier | undefined;
  let company = '';
  let message = '';

  if (isJson) {
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      tier?: string;
      company?: string;
      message?: string;
    };
    email = clean(body.email, 254).toLowerCase();
    tier = body.tier === 'pro' || body.tier === 'enterprise' ? body.tier : undefined;
    company = clean(body.company, MAX_COMPANY);
    message = clean(body.message, MAX_MESSAGE);
  } else {
    const form = await req.formData();
    email = clean(form.get('email'), 254).toLowerCase();
  }

  if (!email || !EMAIL_RE.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }

  const source: Lead['source'] = tier ? 'pricing' : 'waitlist';

  // Quota guard before any Brevo send. Bounded even without Upstash (backstop).
  const limit = await checkWaitlistLimit(clientIp(req), source, new Date());
  if (!limit.ok) {
    return Response.json(
      { error: 'rate_limited', scope: limit.reason },
      { status: 429, headers: { 'retry-after': limit.reason === 'global' ? '3600' : '60' } },
    );
  }

  const lead: Lead = {
    email,
    source,
    tier,
    company: company || undefined,
    message: message || undefined,
  };

  // Always log (audit + safety net if Brevo is down). All fields are CRLF-stripped.
  console.log(
    `[waitlist] ${new Date().toISOString()} ${email} source=${source}` +
      `${tier ? ` tier=${tier}` : ''}${company ? ` company="${company}"` : ''}` +
      `${message ? ` msg=${message.length}chars` : ''}`,
  );

  // Fan out to Brevo after the response is sent - never blocks the visitor.
  after(() => pushToBrevo(lead));

  // Form submissions (homepage) bounce home with a success flag; JSON callers
  // (pricing modal) render their own inline success state.
  if (!isJson) {
    const url = new URL(req.url);
    url.pathname = '/';
    url.search = '?joined=1';
    return NextResponse.redirect(url, { status: 303 });
  }
  return Response.json({ ok: true });
}
