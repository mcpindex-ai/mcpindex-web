// Brevo (REST) lead pipeline: turn a captured email into a CRM contact + emails.
// Execution layer only - the /api/waitlist route orchestrates; this module just
// talks to api.brevo.com. Every function is fail-soft: it returns a structured
// result and NEVER throws, so a Brevo outage degrades the waitlist to "logged
// only" instead of 500-ing the visitor. A 5s timeout bounds each call so a slow
// Brevo can't hang the request.
//
// Credential: BREVO_API_KEY is the REST API key (Brevo -> SMTP & API -> "API
// Keys"), NOT the SMTP key. Read from env, never logged or returned.

const API = 'https://api.brevo.com/v3';
const TIMEOUT_MS = 5_000;

export type LeadSource = 'waitlist' | 'pricing' | 'contact' | 'enterprise_procurement';
export type LeadTier = 'enterprise';

export interface Lead {
  email: string;
  source: LeadSource;
  tier?: LeadTier;
  company?: string;
  message?: string;
}

export type BrevoResult = { ok: true } | { ok: false; error: string };

function apiKey(): string | null {
  const k = process.env.BREVO_API_KEY;
  return k && k.length > 0 ? k : null;
}

export function isBrevoConfigured(): boolean {
  return apiKey() !== null;
}

function sender(): { email: string; name: string } {
  return { email: process.env.BREVO_SENDER_EMAIL || 'hello@mcpindex.ai', name: 'mcpindex' };
}

function listId(): number | null {
  const raw = process.env.BREVO_LEADS_LIST_ID;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

// Operator inbox for per-lead notifications. Env-driven; falls back to the org
// notification/sender address, never a personal address.
function notifyEmail(): string {
  return (
    process.env.BREVO_NOTIFY_EMAIL ||
    process.env.BREVO_SENDER_EMAIL ||
    'hello@mcpindex.ai'
  );
}

// Escape user-controlled text before embedding in an HTML email body so a lead's
// company/message cannot inject markup into the operator notification.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function call(path: string, body: unknown): Promise<BrevoResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'not_configured' };
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    let detail = `status_${res.status}`;
    try {
      const j = (await res.json()) as { code?: string };
      if (j.code) detail = j.code;
      // An already-present contact is a successful idempotent upsert, not a fail.
      if (j.code === 'duplicate_parameter') return { ok: true };
    } catch {
      /* non-JSON error body - keep status_* detail */
    }
    return { ok: false, error: detail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.name : 'fetch_error' };
  }
}

// Add or update the lead as a Brevo contact and put them in the leads list.
// Custom attributes (TIER/COMPANY/MESSAGE/SOURCE) are best-effort enrichment: if
// the account hasn't defined them, Brevo 400s the whole create, so we retry with
// just email + list so the contact still lands. The operator email carries the
// full detail regardless.
export async function upsertLeadContact(lead: Lead): Promise<BrevoResult> {
  const list = listId();
  const listPart = list ? { listIds: [list] } : {};
  const withAttrs = {
    email: lead.email,
    updateEnabled: true,
    attributes: {
      TIER: lead.tier ?? '',
      COMPANY: lead.company ?? '',
      MESSAGE: lead.message ?? '',
      SOURCE: lead.source,
    },
    ...listPart,
  };
  const r = await call('/contacts', withAttrs);
  if (r.ok) return r;
  // Attributes rejected (most often: not defined in the Brevo account). Surface
  // it once, then retry minimally so the contact still lands in the list.
  console.warn(
    `[brevo] contact attributes rejected (${r.error}); ` +
      'define TIER/COMPANY/MESSAGE/SOURCE as contact attributes in Brevo to enable ' +
      'segmentation. Retrying with email + list only.',
  );
  return call('/contacts', { email: lead.email, updateEnabled: true, ...listPart });
}

// Single opt-in welcome to the subscriber themselves.
export async function sendWelcomeEmail(lead: Lead): Promise<BrevoResult> {
  const waitlist = lead.source === 'waitlist';
  const subject = waitlist ? 'You are on the mcpindex list' : 'Thanks for reaching out to mcpindex';
  let intro: string;
  if (lead.source === 'waitlist') {
    intro =
      'Thanks for joining the mcpindex list. We will email product updates only — nothing else.';
  } else if (lead.source === 'pricing') {
    intro = 'Thanks for reaching out about Enterprise. We have your note and will be in touch shortly.';
  } else {
    intro = 'Thanks for reaching out. We have your message and will get back to you shortly.';
  }
  const html =
    `<div style="font-family:ui-monospace,monospace;font-size:14px;line-height:1.6;color:#0a0a0a">` +
    `<p>${intro}</p><p>- the mcpindex team</p>` +
    `<p style="color:#888;font-size:12px">You received this because you signed up at ` +
    `mcpindex.ai. Reply to this email to reach a human.</p></div>`;
  return call('/smtp/email', { sender: sender(), to: [{ email: lead.email }], subject, htmlContent: html });
}

// Per-lead notification to the operator.
export async function notifyOperator(lead: Lead): Promise<BrevoResult> {
  const to = notifyEmail();
  const rows: Array<[string, string]> = [
    ['Email', lead.email],
    ['Source', lead.source],
    ['Tier', lead.tier ?? '-'],
    ['Company', lead.company || '-'],
    ['Message', lead.message || '-'],
  ];
  const table = rows
    .map(([k, v]) => `<tr><td style="padding:2px 12px 2px 0;color:#888">${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('');
  const html =
    `<div style="font-family:ui-monospace,monospace;font-size:14px;color:#0a0a0a">` +
    `<p><strong>New ${esc(lead.source)} lead${lead.tier ? ` (${esc(lead.tier)})` : ''}</strong></p>` +
    `<table>${table}</table></div>`;
  return call('/smtp/email', {
    sender: sender(),
    to: [{ email: to }],
    subject: `New ${lead.source} lead: ${lead.email}`,
    htmlContent: html,
  });
}
