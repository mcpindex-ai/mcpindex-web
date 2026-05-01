import { NextRequest, NextResponse } from 'next/server';

// Stores waitlist signups in Vercel logs only — no third-party email service
// is wired up. Email newsletter was deliberately scoped out (the /changelog +
// /changelog.rss surface is the canonical subscribe path). Inspect signups in
// Vercel dashboard → Project → Logs, filter for [waitlist].
export async function POST(req: NextRequest) {
  let email = '';
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    email = body.email ?? '';
  } else {
    const form = await req.formData();
    email = String(form.get('email') ?? '');
  }
  email = email.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }
  console.log(`[waitlist] ${new Date().toISOString()} ${email}`);

  // For form submissions, bounce back to home with a success query param so we can render a thanks state.
  if (!ct.includes('application/json')) {
    const url = new URL(req.url);
    url.pathname = '/';
    url.search = '?joined=1';
    return NextResponse.redirect(url, { status: 303 });
  }
  return Response.json({ ok: true });
}
