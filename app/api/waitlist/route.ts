import { NextRequest, NextResponse } from 'next/server';
import {
  isBrevoConfigured,
  upsertLeadContact,
  notifyOperator,
  sendWelcomeEmail,
  type Lead,
  type LeadSource,
} from '@/lib/brevo';

/**
 * Contact / list capture.
 * - Footer "Contact" (JSON + source=contact): Brevo contact lead + welcome + operator notify.
 * - Simple email-only / legacy forms: log-only waitlist (changelog RSS is the subscribe path).
 * Fail-soft: always logs; Brevo best-effort; never 500s the visitor when Brevo is down.
 */
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
    if (body.source === 'contact' || body.source === 'pricing') {
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

  console.log(
    `[${source}] ${new Date().toISOString()} ${email}` +
      (company ? ` company=${company}` : ''),
  );

  // Rich contact leads: Brevo when configured.
  if (source === 'contact' || source === 'pricing') {
    const lead: Lead = {
      email,
      source,
      company: company || undefined,
      message: message || undefined,
    };
    if (isBrevoConfigured()) {
      const [contact, welcome, notify] = await Promise.all([
        upsertLeadContact(lead),
        sendWelcomeEmail(lead),
        notifyOperator(lead),
      ]);
      if (!contact.ok) console.warn(`[${source}] brevo contact upsert failed: ${contact.error}`);
      if (!welcome.ok) console.warn(`[${source}] brevo welcome failed: ${welcome.error}`);
      if (!notify.ok) console.warn(`[${source}] brevo operator notify failed: ${notify.error}`);
      return Response.json({ ok: true, delivery: 'sent' });
    }
    return Response.json({ ok: true, delivery: 'logged' });
  }

  // Plain waitlist: log only (RSS is the subscribe path).
  if (!ct.includes('application/json')) {
    const url = new URL(req.url);
    url.pathname = '/';
    url.search = '?joined=1';
    return NextResponse.redirect(url, { status: 303 });
  }
  return Response.json({ ok: true, delivery: 'logged' });
}
