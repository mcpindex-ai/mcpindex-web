import type { NextRequest } from 'next/server';
import { lookupCorroborated, FP_RE, MAX_FPS, type DriftAny } from '@/lib/driftQuery';
import { checkDriftLimit } from '@/lib/ratelimit';

// Fleet drift query (M3): "has this tool_fp drifted for anyone, corroborated?" Read-only,
// fail-OPEN. GET ?fp=<32hex> for a single tool; POST {fps:[...]} for a session's tools.
// Returns only the corroboration verdict (drifted true/false/null) + safe meta -- no tool
// data. The SDK calls this fire-and-forget on first pin and surfaces an ADVISORY note on a
// `true` (never moves PROCEED/HOLD -- AD-6).
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
  const limit = await checkDriftLimit(clientIp(req), new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }
  const fp = (new URL(req.url).searchParams.get('fp') ?? '').toLowerCase();
  if (!FP_RE.test(fp)) {
    return Response.json({ error: 'invalid_fp' }, { status: 400 });
  }
  const res = await lookupCorroborated([fp]);
  return Response.json({ fp, ...(res[fp] as DriftAny) });
}

export async function POST(req: NextRequest) {
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return Response.json({ error: 'unsupported_media_type' }, { status: 415 });
  }
  const limit = await checkDriftLimit(clientIp(req), new Date());
  if (!limit.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '60' } });
  }
  let body: { fps?: unknown };
  try {
    body = (await req.json()) as { fps?: unknown };
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!Array.isArray(body.fps) || body.fps.length === 0 || body.fps.length > MAX_FPS) {
    return Response.json({ error: 'invalid_fps', max: MAX_FPS }, { status: 400 });
  }
  // Validate every fp; reject the whole batch on any malformed entry (fail-closed on shape,
  // mirroring the ingest -- never reflect attacker input).
  const fps = body.fps.map((x) => (typeof x === 'string' ? x.toLowerCase() : ''));
  if (!fps.every((fp) => FP_RE.test(fp))) {
    return Response.json({ error: 'invalid_fps' }, { status: 400 });
  }
  const results = await lookupCorroborated([...new Set(fps)]);
  return Response.json({ results });
}
