import type { NextRequest } from 'next/server';
import { completeLogin, loginEnabled } from '@/lib/loginOAuth';
import { loginStore } from '@/lib/loginStore';
import { WEB_LOGIN_MESSAGE_TYPE, siteOrigin } from '@/lib/webLoginContract';

export const dynamic = 'force-dynamic';

// The GitHub/Google redirect target (MCPINDEX_LOGIN_REDIRECT_URI). Exchanges the code, mints a free
// api_key bound to the account, then delivers it per the mode stored at start:
//  - cli:  redirect the BROWSER (running on the user's machine) to their loopback listener with the
//          key. The server never reaches 127.0.0.1 itself.
//  - web:  postMessage the key to the opener window at the STRICT site origin + a same-origin
//          fallback page that displays it with a copy button. The key never appears in a
//          server-logged URL (it is only ever in this response body), never crosses origins, and is
//          never stored server-side.
// Inert unless MCPINDEX_LOGIN_ENABLED=1.
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

  // BROWSER (web) delivery: hand the key to the opener window (the wizard) via postMessage, with a
  // same-origin display fallback for the no-opener case.
  if (r.mode === 'web') {
    return webSuccessPage(r.apiKey, siteOrigin());
  }

  // Hand the key to the CLI: the browser (local) hits the loopback listener with the key.
  // cliCallback was validated loopback-only at start AND re-checked in completeLogin.
  const target = `${r.cliCallback}?key=${encodeURIComponent(r.apiKey)}`;
  return successPage(target);
}

function esc(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
}

function html(status: number, body: string, csp?: string): Response {
  const headers: Record<string, string> = {
    'content-type': 'text/html; charset=utf-8',
    // The success page body carries the live api_key; keep it out of caches, referrers, frames.
    'cache-control': 'no-store, max-age=0',
    'referrer-policy': 'no-referrer',
    'x-frame-options': 'DENY',
  };
  // Optional CSP. Passed ONLY by the web key page (defense-in-depth against a future template
  // regression exfiltrating the key). The CLI/error paths omit it, so their responses are
  // byte-identical to before this change.
  if (csp) headers['content-security-policy'] = csp;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>mcpindex</title><style>body{font:16px system-ui,sans-serif;max-width:34rem;margin:4rem auto;padding:0 1rem;color:#111}code{background:#f3f3f3;padding:.15rem .35rem;border-radius:4px}</style></head><body>${body}</body></html>`,
    { status, headers },
  );
}

// Strict CSP for the key-bearing web page: no network egress of any kind (default-src 'none'),
// only the inline style/script this page ships, and no base-uri/form-action hijack. This makes it
// impossible for an injected sink to POST/GET the key to a third-party origin. postMessage to the
// opener is NOT a fetch directive, so it is unaffected. NOT applied to the CLI page, whose
// location.replace() to a loopback URL is a top-level navigation (also not a fetch directive).
const KEY_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

/** Encode a string for safe embedding inside a <script> as a JS string literal. */
function jsString(s: string): string {
  // Safe inside <script> as a JS string literal: JSON.stringify handles quotes/backslashes;
  // then neutralize `<` (blocks </script> and <!--) and the U+2028/U+2029 line separators
  // (invalid inside a JS string) so the sink is safe on its own terms, not via upstream regex.
  return JSON.stringify(s).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
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
      `<script>location.replace(${jsString(target)});</script>`,
  );
}

// BROWSER (web) delivery. Same-origin page (served from mcpindex.ai/api/auth/login/callback). It:
//  1. postMessages { type, key } to the opener window at the STRICT `targetOrigin` (the site
//     origin — never '*'), so the wizard receives the key, then closes itself.
//  2. Falls back to DISPLAYING the key with a copy button when there is no opener (e.g. the popup
//     was navigated directly). The key is shown ONCE, mirroring the CLI model.
// The raw key lives only in this response body: never a query param, never cross-origin, never
// stored. Honest disclosure: this key becomes the account's ACTIVE key (issueApiKey rotates any
// prior key).
function webSuccessPage(apiKey: string, targetOrigin: string): Response {
  const k = esc(apiKey);
  const body =
    `<h1>You are signed in</h1>` +
    `<p>Your API key has been sent to the mcpindex window. You can close this tab.</p>` +
    `<p>If the window did not receive it, copy your key and paste it into the wizard:</p>` +
    `<p><code id="k">${k}</code></p>` +
    `<p><button id="cp" type="button">Copy key</button> <span id="ok" role="status"></span></p>` +
    `<p><small>This becomes your account's <strong>active</strong> API key. Any previous key is rotated out and stops working. Store it now &mdash; it is shown only once.</small></p>` +
    `<script>(function(){` +
    `var KEY=${jsString(apiKey)},ORIGIN=${jsString(targetOrigin)},TYPE=${jsString(WEB_LOGIN_MESSAGE_TYPE)};` +
    // Deliver to the opener at the STRICT site origin (never '*'), then self-close the popup.
    `try{if(window.opener&&!window.opener.closed){window.opener.postMessage({type:TYPE,key:KEY},ORIGIN);setTimeout(function(){try{window.close();}catch(e){}},400);}}catch(e){}` +
    // Copy button (no-opener fallback path).
    `var b=document.getElementById('cp');if(b){b.addEventListener('click',function(){var d=document.getElementById('ok');function done(){if(d)d.textContent='Copied';}` +
    `if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(KEY).then(done).catch(function(){});}else{done();}});}` +
    `})();</script>`;
  return html(200, body, KEY_PAGE_CSP);
}
