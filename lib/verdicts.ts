// Canonical reader for the seeded verdict store (data/verdicts.json), written
// by the internal seed pipeline. One source of truth for both the per-server
// trust panel and the /best evidence directory. Enum case is normalized to the
// UPPERCASE wire convention so the
// store tolerates the contract's lowercase enum values and any future
// live-service output. No HTTP: read once at build/SSG time.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { loadServers } from './registry';

export type Decision = 'ALLOW' | 'DENY' | 'REVIEW';
export type VerdictStatus = 'EVALUATED' | 'PARTIAL' | 'STALE' | 'ERROR';
export type DimensionVerdict = 'PASS' | 'FAIL' | 'UNVERIFIED' | 'ERROR';
export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// The deterministic schema-content integrity dimension (scan_schema). Centralized here
// so the badge gate and the server page reference ONE id (no string drift on a
// load-bearing dimension contract). Mirrors the producer's schema_scan._DIM_ID.
export const SCHEMA_CONTENT_DIMENSION_ID = 'mcpindex.integrity.schema_content';

/** Honest-limits token appended when directive.expires_at is in the past. */
export const EXPIRED_VERDICT_LIMIT = 'expired_verdict';

export type Dimension = {
  id: string;
  verdict: DimensionVerdict;
  severity: Severity;
  evidence?: ReadonlyArray<{ quote: string; method?: string }>;
};

// Human adjudication of a SCREEN flag. A raw screen flag never publicly accuses
// on its own (see computeBadgeState): only `confirmed` shows "flagged"; `cleared`
// overturns a false positive. Absent = unreviewed = held as "review".
export type AdjudicationDecision = 'confirmed' | 'cleared';
export type Adjudication = {
  decision: AdjudicationDecision;
  reason: string;
  by: string;
  at: string;
};

// Owner-consented "preview" conformance badge, published by the trust system into a server's
// verdict record (owner_preview_adjudication.publish_preview_badge). A POSITIVE axis, distinct
// from and subordinate to the platform's own screening verdict: it reports an owner-attested
// observation ("no contract drift observed"), NEVER a security/safety clearance. The `statement`
// is honest, already-sanitized owner-facing prose the trust system regenerates deterministically;
// here it is passed through untouched and rendered as escaped text (never HTML).
export type PreviewState = 'clean' | 'drift' | 'inconclusive';
export type PreviewBadge = {
  tier: 'preview';
  by: string;
  confirmed_by: string;
  state: PreviewState;
  n_drift: number;
  date: string;
  server_id: string;
  statement: string;
  re_check_policy: string;
};

export type Verdict = {
  schema_version: '1.0';
  status: VerdictStatus;
  directive: { decision: Decision; rationale: string; expires_at: string };
  dimensions: ReadonlyArray<Dimension>;
  granularity?: string;
  tier?: string; // evidence tier ("scanned" = description-only screen)
  honest_limits?: ReadonlyArray<string>;
  fixture: boolean;
  origin?: string;
  title?: string;
  evaluated_at?: string; // when the screen was produced (freshness signal); ISO string
  adjudication?: Adjudication;
  preview_badge?: PreviewBadge;
  // Derived (never stored): true when the record carries NO real screening verdict -
  // an owner-consented preview badge minted for a server the platform has not screened
  // (origin='owner-preview', or no status AND no dimensions). It is computed in normalize()
  // from the RAW record because after status-coercion a missing status is indistinguishable
  // from a genuine ERROR. The /server page routes the SCREENING axis of such a record to the
  // honest "not yet screened" state (never a red ERROR); the preview_badge axis is independent.
  unscreened?: boolean;
};

type RawVerdict = {
  status?: string;
  directive?: { decision?: string; rationale?: string; expires_at?: string };
  dimensions?: Array<{
    id: string;
    verdict?: string;
    severity?: string;
    evidence?: Array<{ quote: string; method?: string }>;
  }>;
  granularity?: string;
  tier?: string;
  honest_limits?: string[];
  fixture?: boolean;
  origin?: string;
  title?: string;
  evaluated_at?: string;
  adjudication?: { decision?: string; reason?: string; by?: string; at?: string };
  preview_badge?: {
    tier?: string;
    by?: string;
    confirmed_by?: string;
    state?: string;
    n_drift?: number;
    date?: string;
    server_id?: string;
    statement?: string;
    re_check_policy?: string;
  };
};

const STORE = path.join(process.cwd(), 'data', 'verdicts.json');
let _cache: Record<string, Verdict> | null = null;

const UP = (s: string | undefined): string => (s ?? '').toUpperCase();

// Fail-closed enum coercion: an unknown value (corrupt/poisoned store) never
// crashes the renderer and never resolves to a more-permissive state than the
// data supports (e.g. garbage decision -> REVIEW, never ALLOW).
const DECISIONS = new Set<string>(['ALLOW', 'DENY', 'REVIEW']);
const STATUSES = new Set<string>(['EVALUATED', 'PARTIAL', 'STALE', 'ERROR']);
const DVERDICTS = new Set<string>(['PASS', 'FAIL', 'UNVERIFIED', 'ERROR']);
const SEVERITIES = new Set<string>(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const ADJ_DECISIONS = new Set<string>(['confirmed', 'cleared']);

function coerce<T extends string>(s: string | undefined, set: Set<string>, fallback: T): T {
  const u = UP(s);
  return (set.has(u) ? u : fallback) as T;
}

// Fail-closed: an absent OR unrecognized adjudication decision returns undefined,
// so a flagged verdict with garbage adjudication is treated as UNREVIEWED (held
// as "review") - never silently promoted to a confirmed flag or a cleared pass.
function coerceAdjudication(raw: RawVerdict['adjudication']): Adjudication | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const dec = (raw.decision ?? '').toLowerCase();
  if (!ADJ_DECISIONS.has(dec)) return undefined;
  return {
    decision: dec as AdjudicationDecision,
    reason: raw.reason ?? '',
    by: raw.by ?? '',
    at: raw.at ?? '',
  };
}

const PREVIEW_STATES = new Set<string>(['clean', 'drift', 'inconclusive']);

// Pass the owner-controlled badge through as a typed field. The trust system already
// re-sanitizes it deterministically on write/overlay; here we only coerce shape (typed field,
// never trust a raw object) and render every field as escaped text. State is coerced fail-closed
// to 'inconclusive' on a garbage value so a corrupt store can never surface a "clean" chip - the
// honest `statement` prose is the source of truth and renders verbatim (escaped).
function coercePreviewBadge(raw: RawVerdict['preview_badge']): PreviewBadge | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const state = (raw.state ?? '').toLowerCase();
  const nDrift =
    typeof raw.n_drift === 'number' && Number.isFinite(raw.n_drift) ? raw.n_drift : 0;
  return {
    tier: 'preview',
    by: typeof raw.by === 'string' ? raw.by : '',
    confirmed_by: typeof raw.confirmed_by === 'string' ? raw.confirmed_by : '',
    state: (PREVIEW_STATES.has(state) ? state : 'inconclusive') as PreviewState,
    n_drift: nDrift,
    date: typeof raw.date === 'string' ? raw.date : '',
    server_id: typeof raw.server_id === 'string' ? raw.server_id : '',
    statement: typeof raw.statement === 'string' ? raw.statement : '',
    re_check_policy: typeof raw.re_check_policy === 'string' ? raw.re_check_policy : '',
  };
}

// Detect a preview-only record - one with no real screening verdict - from the RAW store
// entry. Must run on the raw record: normalize() coerces a missing status to 'ERROR', after
// which a preview-only record is indistinguishable from a genuine screening ERROR. Heuristic
// (matches the trust writer, owner_preview_adjudication.publish_preview_badge): a record is
// preview-only only when it carries NO real screening status AND either declares
// origin='owner-preview' OR shows the structural signature of a minted-but-unscreened record
// (no dimensions). A record with a real status is NEVER preview-only - it renders its real
// verdict - even in the contractually-impossible case where it also carries
// origin='owner-preview'; the status gate takes precedence so a genuine verdict is never hidden.
function isPreviewOnly(raw: RawVerdict): boolean {
  if (raw.status != null) return false;
  const noDimensions = raw.dimensions == null || raw.dimensions.length === 0;
  return raw.origin === 'owner-preview' || noDimensions;
}

function normalize(raw: RawVerdict): Verdict {
  return {
    schema_version: '1.0',
    status: coerce<VerdictStatus>(raw.status, STATUSES, 'ERROR'),
    directive: {
      decision: coerce<Decision>(raw.directive?.decision, DECISIONS, 'REVIEW'),
      rationale: raw.directive?.rationale ?? '',
      expires_at: raw.directive?.expires_at ?? '',
    },
    dimensions: (raw.dimensions ?? []).map((d) => ({
      id: d.id,
      verdict: coerce<DimensionVerdict>(d.verdict, DVERDICTS, 'UNVERIFIED'),
      severity: coerce<Severity>(d.severity, SEVERITIES, 'INFO'),
      evidence: d.evidence,
    })),
    granularity: raw.granularity,
    tier: raw.tier,
    honest_limits: raw.honest_limits,
    fixture: raw.fixture ?? false,
    origin: raw.origin,
    title: raw.title,
    evaluated_at: typeof raw.evaluated_at === 'string' ? raw.evaluated_at : undefined,
    adjudication: coerceAdjudication(raw.adjudication),
    preview_badge: coercePreviewBadge(raw.preview_badge),
    unscreened: isPreviewOnly(raw),
  };
}

/** True when directive.expires_at is a finite time at or before `now`. Empty/invalid → false. */
export function isVerdictExpired(v: Verdict, now: number = Date.now()): boolean {
  const raw = v.directive.expires_at;
  if (!raw) return false;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return false;
  return now >= t;
}

function hasFailAxis(v: Verdict): boolean {
  return v.dimensions.some((d) => d.verdict === 'FAIL');
}

function withExpiredLimit(v: Verdict): Verdict {
  const limits = v.honest_limits ?? [];
  if (limits.includes(EXPIRED_VERDICT_LIMIT)) return v;
  return { ...v, honest_limits: [...limits, EXPIRED_VERDICT_LIMIT] };
}

/**
 * Read-time expiry overlay (not load-time): warm process caches must flip after the clock.
 * Clean expired → status STALE + expired_verdict token.
 * Expired with any FAIL axis → append token only (never coerce status away from accusation signal).
 */
export function applyExpiryOverlay(v: Verdict, now: number = Date.now()): Verdict {
  if (!isVerdictExpired(v, now)) return v;
  const withLimit = withExpiredLimit(v);
  if (hasFailAxis(v)) return withLimit;
  if (withLimit.status === 'STALE') return withLimit;
  return { ...withLimit, status: 'STALE' };
}

async function loadAll(): Promise<Record<string, Verdict>> {
  if (_cache) return _cache;
  let raw: Record<string, RawVerdict> = {};
  try {
    raw = JSON.parse(await fsp.readFile(STORE, 'utf8'));
  } catch (e) {
    const code = (e as { code?: string }).code;
    // ENOENT = no store seeded yet (expected). Anything else (corrupt JSON,
    // permissions) is a regression that would silently ship an all-unverified
    // site, so surface it at build time.
    if (code !== 'ENOENT') {
      console.warn('verdicts: store unreadable, serving empty:', (e as Error).message);
    }
    raw = {}; // absent or corrupt -> callers fall back to unverified (fail-closed)
  }
  const out: Record<string, Verdict> = {};
  for (const [slug, v] of Object.entries(raw)) out[slug] = normalize(v);
  _cache = out;
  return out;
}

// Bind a verdict to a registry subject by FINAL slug only. No base-key fallback:
// slugify collisions are disambiguated in loadServers; store keys under the retired
// bare slug must not attach to either twin (wrong-subject PASS).
export async function getVerdict(slug: string): Promise<Verdict | null> {
  const servers = await loadServers();
  const subject = servers.find((s) => s.slug === slug);
  if (!subject) return null;
  const all = await loadAll();
  // Object.hasOwn guards against prototype keys (e.g. "__proto__") resolving to
  // the prototype object rather than a real verdict.
  const v = Object.hasOwn(all, subject.slug) ? all[subject.slug] : undefined;
  if (!v || v.fixture) return null;
  return applyExpiryOverlay(v);
}

/**
 * getVerdict, minus preview-only records — the accessor every JSON API must use.
 *
 * A preview-only record (an owner-consented preview badge minted for a server the
 * platform has NOT screened) carries no screening verdict: normalize() coerced its
 * absent status to ERROR and its absent directive to REVIEW. Returning that verbatim
 * reports `REVIEW` on the wire, which implies a screen ran.
 *
 * This guard lived inline in /api/v1/trust/server ONLY, so that route answered
 * UNVERIFIED (correct) while /api/v1/trust/tool and /api/v1/preflight answered REVIEW
 * for the SAME subject. Hoisted here so the three cannot drift again. Latent until the
 * owner P1-P4 flow mints its first badge for an unscreened server — which is live now
 * on owner.mcpindex.ai, so this stops being theoretical on the first external claim.
 *
 * NOT folded into getVerdict itself: the /server page, the OG image, and the badge
 * legitimately need the unscreened record so they can route it to the honest
 * "not yet screened" presentation rather than a 404.
 */
export async function getScreenedVerdict(slug: string): Promise<Verdict | null> {
  const v = await getVerdict(slug);
  return v && !v.unscreened ? v : null;
}

// Screened real servers: only registry subjects whose final slug has a store key.
// Orphan / bare-colliding store keys never appear (fail-closed).
// O(n+m): Set membership against store entries — not getVerdict-per-server (that was O(n²)).
export async function listScreened(): Promise<Array<{ slug: string; verdict: Verdict }>> {
  const servers = await loadServers();
  const validSlugs = new Set(servers.map((s) => s.slug));
  const all = await loadAll();
  const now = Date.now();
  return Object.entries(all)
    .filter(([slug, v]) => validSlugs.has(slug) && !v.fixture)
    .map(([slug, v]) => ({ slug, verdict: applyExpiryOverlay(v, now) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

// The labeled adversarial fixtures (NOT real servers) for the showcase.
export async function listFixtures(): Promise<Array<{ slug: string; verdict: Verdict }>> {
  const all = await loadAll();
  return Object.entries(all)
    .filter(([, v]) => v.fixture)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, verdict]) => ({ slug, verdict }));
}

// NOTE: a raw "has a FAIL dimension" predicate was deliberately REMOVED. It is a
// footgun for public surfaces: an unadjudicated false-positive screen flag must
// never be publicly shown/counted as "flagged". Use computeBadgeState (lib/badge)
// everywhere - it applies the accusation gate (only a human-confirmed flag is
// "flagged"; a raw flag is held as "review").
