import type { NextRequest } from 'next/server';
import { completeLogin, loginEnabled } from '@/lib/loginOAuth';
import { loginStore } from '@/lib/loginStore';

export const dynamic = 'force-dynamic';

// The GitHub redirect target (MCPINDEX_LOGIN_REDIRECT_URI). Exchanges the code, mints a free
// api_key bound to the account, then hands it to the gate CLI by redirecting the BROWSER (which
// runs on the user's machine) to their loopback listener with the key. The server never reaches
// 127.0.0.1 itself. Inert unless MCPINDEX_LOGIN_ENABLED=1.
export async function GET(req: NextRequest) {
  if (!loginEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const params = new URL(req.url).searchParams;
  const code = params.get('code') ?? '';
  const state = (params.get('state') ?? '').toLowerCase();

  const store = loginStore();
  if (!store) {
    return page('Login unavailable', 'The login service is temporarily unavailable. Please try again.', 503);
  }

  const r = await completeLogin(state, code, store);
  if ('error' in r) {
    const status = r.error === 'invalid_state' || r.error === 'invalid_request' || r.error === 'exchange_failed' ? 400 : 503;
    return page('Login failed', `We could not complete the login (${r.error}). Please run mcpindex login again.`, status);
  }

  // Hand the key to the CLI: the browser (local) hits the loopback listener with the key.
  // cliCallback was validated loopback-only at start AND re-checked in completeLogin.
  const target = `${r.cliCallback}?key=${encodeURIComponent(r.apiKey)}`;
  return successPage(target);
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
}

function html(status: number, body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mcpindex</title><style>body{font:16px system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#111}code{background:#f3f3f3;padding:.15rem .35rem;border-radius:4px}</style></head><body>${body}</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

function page(title: string, msg: string, status: number): Response {
  return html(status, `<h1>${esc(title)}</h1><p>${esc(msg)}</p>`);
}

function successPage(target: string): Response {
  // JS-redirect the local browser to the loopback listener; the CLI captures the key. A public
  // page redirecting to localhost can be blocked by some browsers, so also show a manual link.
  const t = esc(target);
  return html(
    200,
    `<h1>You are signed in</h1><p>Returning to your terminal&hellip;</p>` +
      `<p>If nothing happens, <a href="${t}">click here</a> to finish, then return to your terminal.</p>` +
      `<script>location.replace(${JSON.stringify(target)});</script>`,
  );
}
