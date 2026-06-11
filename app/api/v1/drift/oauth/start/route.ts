import type { NextRequest } from 'next/server';
import { INSTALL_ID } from '@/lib/driftIdentity';
import { oauthEnabled, startUpgrade } from '@/lib/driftOAuth';
import { checkOAuthLimit } from '@/lib/ratelimit';

export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function parseBearer(req: NextRequest): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m ? m[1].trim() : null;
}

export async function GET(req: NextRequest) {
  if (!oauthEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const ip = clientIp(req);
  const limit = await checkOAuthLimit(ip, new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }

  const installId = new URL(req.url).searchParams.get('install_id')?.toLowerCase() ?? '';
  if (!INSTALL_ID.test(installId)) {
    return Response.json({ error: 'invalid_install_id' }, { status: 400 });
  }

  const token = parseBearer(req);
  if (!token) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const result = await startUpgrade(installId, token);
  if (!result) {
    return Response.json({ error: 'invalid_install_id' }, { status: 400 });
  }
  if ('unavailable' in result) {
    return Response.json({ error: 'oauth_unavailable' }, { status: 503 });
  }
  if ('error' in result) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  return Response.redirect(result.url, 302);
}
