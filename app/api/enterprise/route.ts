import { NextRequest } from 'next/server';
import { isBrevoConfigured, upsertLeadContact, notifyOperator, type Lead } from '@/lib/brevo';

// Enterprise / procurement lead capture. This is the ONE gated conversation the
// (public, ungated) whitepaper earns: "request the security & procurement pack".
// It reuses the same Brevo plumbing as the waitlist, tagged source
// `enterprise_procurement` so these serious, sales-ready leads segment cleanly.
//
// Fail-soft, exactly like the waitlist: the lead is ALWAYS logged, and Brevo
// writes are best-effort. An unconfigured or failing Brevo degrades to
// "logged only" and still returns ok - it never 500s the visitor.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    company?: string;
    message?: string;
  };

  const email = (body.email ?? '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }

  const company = (body.company ?? '').trim().slice(0, 200);
  const message = (body.message ?? '').trim().slice(0, 2000);

  const lead: Lead = {
    email,
    source: 'enterprise_procurement',
    tier: 'enterprise',
    company: company || undefined,
    message: message || undefined,
  };

  console.log(
    `[enterprise] ${new Date().toISOString()} ${email}` +
      (company ? ` company=${company}` : ''),
  );

  // Log-only when Brevo is not wired - the operator still has the Vercel log.
  if (!isBrevoConfigured()) {
    return Response.json({ ok: true, delivery: 'logged' });
  }

  // Best-effort: contact upsert + operator notification. Both fail-soft (the
  // brevo module never throws), so a degraded Brevo does not fail the visitor.
  const [contact, notify] = await Promise.all([
    upsertLeadContact(lead),
    notifyOperator(lead),
  ]);

  if (!contact.ok) console.warn(`[enterprise] brevo contact upsert failed: ${contact.error}`);
  if (!notify.ok) console.warn(`[enterprise] brevo operator notify failed: ${notify.error}`);

  return Response.json({ ok: true, delivery: 'sent' });
}
