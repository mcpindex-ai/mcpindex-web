import type { NextRequest } from 'next/server';
import { driftIdentityEnabled, INSTALL_ID, issueIdentity, revokeIdentity } from '@/lib/driftIdentity';
import { checkRegisterLimit } from '@/lib/ratelimit';

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

export async function POST(req: NextRequest) {
  if (!driftIdentityEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return Response.json({ error: 'unsupported_media_type' }, { status: 415 });
  }

  const ip = clientIp(req);
  const limit = await checkRegisterLimit(ip, new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }

  let body: { install_id?: unknown };
  try {
    body = (await req.json()) as { install_id?: unknown };
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const installId = typeof body.install_id === 'string' ? body.install_id.toLowerCase() : '';
  if (!INSTALL_ID.test(installId)) {
    return Response.json({ error: 'invalid_install_id' }, { status: 400 });
  }

  const currentToken = parseBearer(req) ?? undefined;
  const issued = await issueIdentity(installId, currentToken);
  if (!issued) {
    return Response.json({ error: 'invalid_install_id' }, { status: 400 });
  }
  if ('unavailable' in issued) {
    return Response.json({ error: 'identity_store_unavailable' }, { status: 503 });
  }
  if ('conflict' in issued) {
    return Response.json({ error: 'already_registered' }, { status: 409 });
  }

  return Response.json({ install_id: installId, install_token: issued.token });
}

export async function DELETE(req: NextRequest) {
  if (!driftIdentityEnabled()) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const token = parseBearer(req);
  if (!token) {
    return Response.json({ error: 'missing_token' }, { status: 401 });
  }

  let installId = new URL(req.url).searchParams.get('install_id')?.toLowerCase() ?? '';
  if (!installId && (req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    try {
      const body = (await req.json()) as { install_id?: unknown };
      installId = typeof body.install_id === 'string' ? body.install_id.toLowerCase() : '';
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }
  }

  if (!INSTALL_ID.test(installId)) {
    return Response.json({ error: 'invalid_install_id' }, { status: 400 });
  }

  const revoked = await revokeIdentity(installId, token);
  if (!revoked) {
    return Response.json({ revoked: false }, { status: 404 });
  }

  return Response.json({ revoked: true });
}
