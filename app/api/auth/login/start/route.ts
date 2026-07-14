import type { NextRequest } from 'next/server';
import { loginEnabled, normalizeProvider, startLogin } from '@/lib/loginOAuth';
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

// GET /api/auth/login/start?cli_callback=http://127.0.0.1:<port>[&provider=github|google]
// Begins the self-serve login: validates the loopback callback, stores it (with the chosen
// provider) under a one-time state, and redirects the browser to the provider. Provider defaults
// to github; an unconfigured provider redirects nowhere and returns 503 (inert). Inert unless
// MCPINDEX_LOGIN_ENABLED=1.
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
  const cliCallback = params.get('cli_callback') ?? '';
  const provider = normalizeProvider(params.get('provider'));
  const store = loginStore();
  if (!store) {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  const r = await startLogin(cliCallback, store, provider);
  if ('error' in r) {
    return Response.json({ error: r.error }, { status: r.error === 'bad_callback' ? 400 : 503 });
  }
  return new Response(null, { status: 302, headers: { location: r.url } });
}
