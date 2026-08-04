import type { NextRequest } from 'next/server';
import { screenDescription, MAX_DESCRIPTION } from '@/lib/screen';
import { checkScreenLimit } from '@/lib/ratelimit';
import { VERDICT_CONTRACT_VERSION } from '@/lib/verdictContract';

// Live screen of a single pasted tool description. POST only. Rate-limiting on
// /api/v1/* is enforced by proxy.ts (per-IP); this route adds a hard length cap
// and is fail-closed (no key / judge error -> 503 UNAVAILABLE, never a fake pass).
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Require application/json. A cross-origin browser sending JSON triggers a
  // CORS preflight, which vercel.json's "GET, OPTIONS" allow-list rejects -
  // so this closes the only no-preflight ("simple") cross-origin path
  // (text/plain) that could let a third-party site burn the paid Groq budget
  // from visitors' browsers. Direct (curl/script) callers are unaffected;
  // the rate limiter + provider spend cap remain their backstop.
  if (!(req.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
    return Response.json({ error: 'unsupported_media_type' }, { status: 415 });
  }

  let body: { description?: string; contribute?: boolean };
  try {
    body = (await req.json()) as { description?: string; contribute?: boolean };
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const description = (body.description ?? '').trim();
  if (!description) {
    return Response.json({ error: 'missing_description' }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION) {
    return Response.json(
      { error: 'description_too_long', max: MAX_DESCRIPTION },
      { status: 413 },
    );
  }

  // Cost guard before the paid Groq call: shared per-IP limit + global daily
  // ceiling (Upstash). Vercel sets x-vercel-forwarded-for at the edge (client
  // cannot forge it); raw x-forwarded-for is the off-Vercel fallback only.
  const ip =
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const limit = await checkScreenLimit(ip, new Date());
  if (!limit.ok) {
    return Response.json(
      { error: 'rate_limited', scope: limit.reason },
      { status: 429, headers: { 'retry-after': limit.reason === 'global' ? '3600' : '60' } },
    );
  }

  const result = await screenDescription(description);
  if (result.state === 'unavailable') {
    // Fail-closed: advisory screen is down; never imply the tool is safe.
    return Response.json(
      { status: 'UNAVAILABLE', advisory: true, honest_limit: 'screening_unavailable' },
      { status: 503 },
    );
  }

  // AD-1 (opt-in): persist ONLY on explicit consent. No IP, no PII - the
  // description the user chose to contribute + the verdict + timestamp. The
  // privacy page documents this as the one scoped exception to "we do not
  // persist task descriptions". Inspect in Vercel logs, filter [screen-contribution].
  if (body.contribute === true) {
    console.log(
      `[screen-contribution] ${new Date().toISOString()} state=${result.state} ` +
        JSON.stringify(description.slice(0, MAX_DESCRIPTION)),
    );
  }

  const flagged = result.state === 'flagged';
  // Advisory wire shape: never ALLOW (uncalibrated); flagged -> the finding +
  // the verbatim line; clean -> a passing semantic screen. Status PARTIAL
  // because the deterministic conformance leg did not run.
  return Response.json({
    schema_version: '1.0',
    verdict_contract_version: VERDICT_CONTRACT_VERSION,
    status: 'PARTIAL',
    directive: {
      decision: 'REVIEW',
      rationale: flagged
        ? `Manipulation pattern flagged: ${result.reason}. Review before your agent calls this tool.`
        : 'No manipulation pattern detected in the description (semantic screen). A pass means the description is not lying, not that the tool is safe.',
    },
    finding: {
      id: 'mcpindex.integrity.description',
      verdict: flagged ? 'FAIL' : 'PASS',
      severity: flagged ? 'CRITICAL' : 'INFO',
      quote: flagged ? result.quote : null,
    },
    honest_limits: ['semantic_only_no_conformance', 'calibrated_false_v1', 'live_screen', 'advisory'],
  });
}
