import type { NextRequest } from 'next/server';
import { loginEnabled, startLogin } from '@/lib/loginOAuth';
import { loginStore } from '@/lib/loginStore';

export const dynamic = 'force-dynamic';

// GET /api/auth/login/start?cli_callback=http://127.0.0.1:<port>
// Begins the GitHub self-serve login: validates the loopback callback, stores it under a
// one-time state, and redirects the browser to GitHub. Inert unless MCPINDEX_LOGIN_ENABLED=1.
export async function GET(req: NextRequest) {
  if (!loginEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  const cliCallback = new URL(req.url).searchParams.get('cli_callback') ?? '';
  const store = loginStore();
  if (!store) {
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
  const r = await startLogin(cliCallback, store);
  if ('error' in r) {
    return Response.json({ error: r.error }, { status: r.error === 'bad_callback' ? 400 : 503 });
  }
  return new Response(null, { status: 302, headers: { location: r.url } });
}
