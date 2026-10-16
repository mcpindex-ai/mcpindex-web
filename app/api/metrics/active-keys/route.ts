import { NextRequest } from 'next/server';
import { activeKeysSeries, SERIES_MAX_DAYS } from '@/lib/activeKeys';
import { metricsReaderAuthorized } from '@/lib/metricsReader';

// The active-key count (lib/activeKeys.ts) for the agent factory, so it can measure the north-star
// metric without holding Upstash credentials. Counts only: no key id, hash or account leaves here.
//
//   GET /api/metrics/active-keys?end=2026-10-31&days=29
//   Authorization: Bearer <factory reader token>   (lib/metricsReader.ts)
//
// 200 {series: ActiveKeysReport[]} oldest first; 400 bad end or days; 401 any auth failure
// (one body for all); 503 when the store cannot be read, which must never read as zero keys.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'cache-control': 'no-store' };

export async function GET(req: NextRequest) {
  if (!metricsReaderAuthorized(req.headers.get('authorization'))) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  }
  const q = req.nextUrl.searchParams;
  const end = q.get('end') ?? new Date().toISOString().slice(0, 10);
  const daysRaw = q.get('days') ?? '1';
  const days = /^\d{1,2}$/.test(daysRaw) ? Number(daysRaw) : NaN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !(days >= 1 && days <= SERIES_MAX_DAYS)) {
    return Response.json({ error: `end is YYYY-MM-DD, days is 1..${SERIES_MAX_DAYS}` },
      { status: 400, headers: NO_STORE });
  }
  let series;
  try {
    series = await activeKeysSeries(end, days);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('bad date')) {
      return Response.json({ error: 'end is not a real date' }, { status: 400, headers: NO_STORE });
    }
    console.error('metrics/active-keys: read failed', e instanceof Error ? e.message : 'unknown');
    return Response.json({ error: 'active keys unread' }, { status: 503, headers: NO_STORE });
  }
  return Response.json({ series }, { headers: NO_STORE });
}
