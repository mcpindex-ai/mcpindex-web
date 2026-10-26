// trust.mjs - check_tool_trust / assess_server verdict client.
//
// Contract (v1 advisory, free tier). The API's verdict object is carried through
// unchanged; the client only ADDS the flat convenience fields at the end:
//   {
//     subject: { server_id, tool_name, tool_verified? },  // as the API sent it
//     directive: "ALLOW" | "DENY" | "REVIEW" | "UNVERIFIED",
//     status: "EVALUATED" | "PARTIAL" | "STALE" | "ERROR",
//     granularity: string | null,   // e.g. "description-level" for a PARTIAL screen
//     dimensions: [{ id, verdict, severity }],
//     expires_at: string | null,
//     honest_limits: string[],      // the API's own list, verbatim
//     verdict_contract_version: string,  // the API's own version
//     server_id, tool_name?, source_url, fetched_at   // added by this client
//   }
//
// Why pass-through: this client used to stamp its own contract version (1.0.0) over the
// API's (1.1.0), drop subject.tool_verified:false, and prepend a local honest_limits floor
// that contradicted the API's limits (conformance_monitored_not_enforced next to the API's
// semantic_only_no_conformance). A trust client that rewrites the verdict it relays is
// overstating what it knows. The local floor and version are used ONLY for verdicts this
// client fabricates itself (fail-closed UNVERIFIED) or when the API sent no value.
//
// Fail-CLOSED: if the upstream endpoint is unreachable, returns non-2xx, or
// returns malformed data, we return directive=UNVERIFIED, status=ERROR.
// We NEVER fake an ALLOW. This is the load-bearing safety invariant.
//
// status is TELEMETRY about screen completeness (not the trust decision - that is
// `directive`). PARTIAL means the screen only covered part of the surface (e.g.
// description-level, not the live tool); it must NEVER be reported as EVALUATED. An
// unexpected/unknown status is coerced DOWN to STALE (conservative), never up to
// EVALUATED - overstating completeness is the one direction a trust tool must not drift.

// Version stamped on verdicts this client builds itself (fail-closed UNVERIFIED) and the
// fallback when the API omits one. Matches the API's current contract
// (mcpindex-web lib/verdictContract.ts); an API-supplied version always wins.
export const VERDICT_CONTRACT_VERSION = '1.1.0';

export const V1_HONEST_LIMITS = Object.freeze([
  'conformance_monitored_not_enforced',
  'calibrated_false_v1',
  'advisory_deployment',
]);

const VALID_DIRECTIVES = new Set(['ALLOW', 'DENY', 'REVIEW', 'UNVERIFIED']);
const VALID_STATUSES = new Set(['EVALUATED', 'PARTIAL', 'STALE', 'ERROR']);
const VALID_VERDICTS = new Set(['PASS', 'FAIL', 'UNVERIFIED']);
const VALID_SEVERITIES = new Set(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const DEFAULT_TIMEOUT_MS = 5000;

const SEMVER = /^\d+\.\d+\.\d+$/;

// Path-segment guard, ported from the hosted endpoint's safeSeg (mcpindex-web
// lib/v1Dispatch.ts) so both transports reject the same inputs. Block-list, so no
// legitimate slug or tool name is rejected. Every decoded form is checked too: the API
// decodes the segment again, so `%2e%2e` or `%252e%252e` would otherwise arrive as `..`.
function unsafeSeg(v) {
  return !v || v === '.' || v.includes('/') || v.includes('\\') || v.includes('..') || /[\u0000-\u001f]/.test(v);
}

export function isSafeSegment(v) {
  if (typeof v !== 'string') return false;
  let cur = v;
  for (let i = 0; i < 3; i++) {
    if (unsafeSeg(cur)) return false;
    let next;
    try {
      next = decodeURIComponent(cur);
    } catch {
      return false;
    }
    if (next === cur) return true;
    cur = next;
  }
  return false;
}

function subjectFor(serverId, toolName) {
  // Same shape the API sends on its own UNVERIFIED branch: the tool endpoint never
  // confirms the tool exists, so tool_verified is false; the server endpoint has no tool.
  return toolName === undefined
    ? { server_id: serverId, tool_name: null }
    : { server_id: serverId, tool_name: toolName, tool_verified: false };
}

function unverifiedResponse({ serverId, toolName, sourceUrl, reason }) {
  return {
    subject: subjectFor(serverId, toolName),
    directive: 'UNVERIFIED',
    status: 'ERROR',
    granularity: null,
    dimensions: [],
    expires_at: null,
    honest_limits: [...V1_HONEST_LIMITS, `unverified_reason:${reason}`],
    verdict_contract_version: VERDICT_CONTRACT_VERSION,
    server_id: serverId,
    ...(toolName ? { tool_name: toolName } : {}),
    source_url: sourceUrl,
    fetched_at: new Date().toISOString(),
  };
}

function normalizeDimensions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const d of raw) {
    if (!d || typeof d !== 'object') continue;
    const id = typeof d.id === 'string' ? d.id : null;
    const verdict = VALID_VERDICTS.has(d.verdict) ? d.verdict : 'UNVERIFIED';
    const severity = VALID_SEVERITIES.has(d.severity) ? d.severity : 'INFO';
    if (!id) continue;
    out.push({ id, verdict, severity });
  }
  return out;
}

function shapeVerdict({ raw, serverId, toolName, sourceUrl }) {
  // Defensive: if upstream returns garbage, treat as UNVERIFIED.
  if (!raw || typeof raw !== 'object') {
    return unverifiedResponse({ serverId, toolName, sourceUrl, reason: 'empty_payload' });
  }

  const directive = VALID_DIRECTIVES.has(raw.directive) ? raw.directive : 'UNVERIFIED';
  // Known status passes through verbatim (incl. PARTIAL). An UNKNOWN status is coerced
  // conservatively: ERROR when there's no directive, else STALE — NEVER 'EVALUATED',
  // which would falsely claim a complete screen.
  const status = VALID_STATUSES.has(raw.status)
    ? raw.status
    : directive === 'UNVERIFIED'
      ? 'ERROR'
      : 'STALE';
  // Screen granularity (e.g. "description-level"); pass through so callers can see a
  // PARTIAL screen's scope instead of silently losing it.
  const granularity = typeof raw.granularity === 'string' ? raw.granularity : null;
  const dimensions = normalizeDimensions(raw.dimensions);
  const expires_at = typeof raw.expires_at === 'string' ? raw.expires_at : null;

  // honest_limits: the API's list, verbatim and in order. The local floor is used only
  // when the API sent none, so a verdict is never relayed with no caveats at all - but it
  // is never merged INTO the API's list, where it can contradict what the API said.
  const sent = Array.isArray(raw.honest_limits)
    ? raw.honest_limits.filter((s) => typeof s === 'string')
    : [];
  const honest_limits = sent.length ? Array.from(new Set(sent)) : [...V1_HONEST_LIMITS];

  const verdict_contract_version =
    typeof raw.verdict_contract_version === 'string' && SEMVER.test(raw.verdict_contract_version)
      ? raw.verdict_contract_version
      : VERDICT_CONTRACT_VERSION;

  // subject (incl. tool_verified) as the API sent it; synthesized only when absent.
  const subject =
    raw.subject && typeof raw.subject === 'object' && !Array.isArray(raw.subject)
      ? raw.subject
      : subjectFor(serverId, toolName);

  return {
    subject,
    directive,
    status,
    granularity,
    dimensions,
    expires_at,
    honest_limits,
    verdict_contract_version,
    server_id: serverId,
    ...(toolName ? { tool_name: toolName } : {}),
    source_url: sourceUrl,
    fetched_at: new Date().toISOString(),
  };
}

async function fetchVerdict({ url, userAgent, fetchImpl, timeoutMs }) {
  const f = fetchImpl ?? fetch;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await f(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const reason = err && err.name === 'AbortError' ? 'timeout' : 'network_error';
    return { ok: false, reason };
  } finally {
    clearTimeout(t);
  }
}

export async function checkToolTrust({
  serverId,
  toolName,
  apiBase = 'https://mcpindex.ai',
  userAgent = `mcp-server-mcpindex/${VERDICT_CONTRACT_VERSION}`,
  fetchImpl,
  timeoutMs,
}) {
  if (!serverId || !toolName) {
    return unverifiedResponse({
      serverId: serverId ?? '',
      toolName: toolName ?? '',
      sourceUrl: '',
      reason: 'missing_args',
    });
  }
  if (!isSafeSegment(serverId) || !isSafeSegment(toolName)) {
    return unverifiedResponse({ serverId, toolName, sourceUrl: '', reason: 'invalid_args' });
  }
  const url = `${apiBase}/api/v1/trust/tool/${encodeURIComponent(serverId)}/${encodeURIComponent(toolName)}`;
  const r = await fetchVerdict({ url, userAgent, fetchImpl, timeoutMs });
  if (!r.ok) {
    return unverifiedResponse({ serverId, toolName, sourceUrl: url, reason: r.reason });
  }
  return shapeVerdict({ raw: r.data, serverId, toolName, sourceUrl: url });
}

export async function assessServer({
  serverId,
  apiBase = 'https://mcpindex.ai',
  userAgent = `mcp-server-mcpindex/${VERDICT_CONTRACT_VERSION}`,
  fetchImpl,
  timeoutMs,
}) {
  if (!serverId) {
    return unverifiedResponse({
      serverId: '',
      sourceUrl: '',
      reason: 'missing_args',
    });
  }
  if (!isSafeSegment(serverId)) {
    return unverifiedResponse({ serverId, sourceUrl: '', reason: 'invalid_args' });
  }
  const url = `${apiBase}/api/v1/trust/server/${encodeURIComponent(serverId)}`;
  const r = await fetchVerdict({ url, userAgent, fetchImpl, timeoutMs });
  if (!r.ok) {
    return unverifiedResponse({ serverId, sourceUrl: url, reason: r.reason });
  }
  return shapeVerdict({ raw: r.data, serverId, sourceUrl: url });
}
