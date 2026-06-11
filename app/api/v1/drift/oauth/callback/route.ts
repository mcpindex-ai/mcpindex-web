import type { NextRequest } from 'next/server';
import { OAUTH_STATE, bindGithub, oauthEnabled } from '@/lib/driftOAuth';
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

export async function GET(req: NextRequest) {
  if (!oauthEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const params = new URL(req.url).searchParams;
  const code = params.get('code');
  const state = params.get('state')?.toLowerCase() ?? '';

  if (!code || !state || !OAUTH_STATE.test(state)) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const ip = clientIp(req);
  const limit = await checkOAuthLimit(ip, new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }

  const result = await bindGithub(state, code);
  if ('unavailable' in result) {
    return Response.json({ error: 'oauth_unavailable' }, { status: 503 });
  }
  if ('error' in result) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>GitHub linked</title>
</head>
<body>
<p>Your GitHub account is linked and the install is verified (cost class: github). You can close this tab.</p>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
