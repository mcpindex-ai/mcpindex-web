import type { NextRequest } from 'next/server';
import { loginEnabled, normalizeProvider, startLogin, startLoginWeb } from '@/lib/loginOAuth';
import { loginStore } from '@/lib/loginStore';
import { checkLoginLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

// GET /api/auth/login/start?cli_callback=http://127.0.0.1:<port>[&provider=github|google]  (CLI)
// GET /api/auth/login/start?mode=web[&provider=github|google]                              (BROWSER)
// Begins the self-serve login. In the default (CLI) mode it validates the loopback callback, stores
// it (with the chosen provider) under a one-time state, and redirects to the provider — the minted
// key is later handed to the gate CLI's loopback listener. In web mode there is NO cli_callback:
// the key is delivered to the BROWSER at the callback (postMessage to the opener / same-origin
// display page). Both modes share the SAME OAuth machinery (provider allowlist, state/PKCE CSRF,
// issueApiKey) and the SAME rate-limit. Provider defaults to github; an unconfigured provider
// returns 503 (inert). Inert unless MCPINDEX_LOGIN_ENABLED=1.
export async function GET(req: NextRequest) {
  if (!loginEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  // Rate-limit BEFORE the state-store write: bounds pre-auth cost/abuse on the shared Upstash.
  const limit = await checkLoginLimit(clientIp(req), new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }
  const params = new URL(req.url).searchParams;
  const provider = normalizeProvider(params.get('provider'));
  const store = loginStore();
  if (!store) {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  // Web mode is additive: NO cli_callback, no loopback validation. The loopback branch below is
  // byte-unchanged from the CLI flow.
  const r =
    params.get('mode') === 'web'
      ? await startLoginWeb(store, provider)
      : await startLogin(params.get('cli_callback') ?? '', store, provider);
  if ('error' in r) {
    return Response.json({ error: r.error }, { status: r.error === 'bad_callback' ? 400 : 503 });
  }
  return new Response(null, { status: 302, headers: { location: r.url } });
}
