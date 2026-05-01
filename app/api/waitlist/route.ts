import { NextRequest, NextResponse } from 'next/server';

// v0 stub. Day-0 task wires this to Loops. For now we log + redirect-back so the
// form works without external accounts.
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
