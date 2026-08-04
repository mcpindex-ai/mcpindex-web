// Canonical reader for the seeded verdict store (data/verdicts.json), written
// by the internal seed pipeline. One source of truth for both the per-server
// trust panel and the /best evidence directory. Enum case is normalized to the
// UPPERCASE wire convention so the
// store tolerates the contract's lowercase enum values and any future
// live-service output. No HTTP: read once at build/SSG time.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadServers, loadSnapshotMeta } from './registry';

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

/**
 * Honest-limits token appended when the record's content_hash no longer matches the
 * sha256 of the description currently published in the registry: the screen judged
 * text that has since been replaced. Cause-agnostic — it fires for post-judge drift
 * and for born-stale records (judged from a lagging input snapshot) alike.
 */
export const CONTENT_DRIFT_LIMIT = 'content_drift';

/**
 * Honest-limits token appended when the registry LISTING changed after the screen ran, while
 * the screened description itself did not.
 *
 * The screen reads the description and nothing else — `description_level_screen` and
 * `registry_description_only_no_input_schema` say so on every verdict. So a version bump, a
 * new package, or a changed repository link moves the server without moving the one input we
 * judged, and a re-screen of that unchanged text would return the same verdict. 1,835 of
 * 19,574 resolvable records (9.4%) are in this state today.
 *
 * Reported, never gated. Demoting the badge for this would imply the screen covered the
 * artifact, which it never did — over-claiming in the opposite direction from the staleness
 * bug this file's confirmation overlay exists to fix. The badge is a two-pill SVG with no room
 * for nuance; `honest_limits` is the mechanism built to carry exactly this.
 *
 * KNOWN LIMIT, stated rather than papered over: the store does not record which version was
 * screened, so this can say "the listing moved after we looked" but not "we screened v0.3.2
 * and v0.3.3 is now published." Recording the screened version at write time is what would
 * close that, and it cannot be backfilled.
 */
export const LISTING_CHANGED_LIMIT = 'listing_changed_since_screen';

/**
 * Kill switch for the content-drift overlay. Default ON: OFF is the less safe state
 * (verdicts bound to superseded text render as live assessments), so it must be the
 * deliberate act — set CONTENT_DRIFT_OVERLAY=0 to revert to clock-only staleness
 * without a deploy.
 */
export function contentDriftOverlayEnabled(): boolean {
  return process.env.CONTENT_DRIFT_OVERLAY !== '0';
}

/**
 * Honest-limits token appended when a verdict's freshness window was extended by
 * RE-CONFIRMING the screened text rather than by a fresh screen. It is the reader's cue
 * that this record is current because nothing it depends on changed - not because we
 * screened it again today.
 */
export const FRESHNESS_CONFIRMED_LIMIT = 'freshness_confirmed';

/**
 * Records screened before this instant are treated as produced under a RETIRED screen
 * policy and are never confirmed - they must be re-screened before their freshness can be
 * extended.
 *
 * THIS IS THE INVALIDATION LEVER. Bump it whenever the screen model, system prompt, or
 * calibration changes, exactly as COMPOSITE_PROBE_POLICY_HASH is hand-bumped for the probe
 * corpus (mcpindex-trust proberunner.py:54). It encodes the same discipline the D3 corpus
 * already follows (tasks/decisions.md): bump the policy identity, re-screen, and only THEN
 * let conclusions stand - never carry a conclusion forward under a definition that moved.
 *
 * Bumping this makes the ENTIRE corpus unconfirmable at once, so every record decays to
 * "re-check due" until the backfill lane re-screens it (~16 days at the current rate). That
 * is the correct cost of a policy change, but it is not a small one - plan the re-screen
 * pass alongside the bump.
 *
 * MUST stay in lockstep with POLICY_EPOCH in
 * tools/healthcheck/mcpindex_verdict_confirmable_share.py, which grades how much of the
 * corpus this predicate can still confirm. If they drift, the probe reports on a different
 * corpus than the site renders.
 */
export const POLICY_EPOCH = '2026-01-01T00:00:00Z';

// NOTE: an earlier draft of this overlay ALSO required the `screen_model_8b` honest-limit
// before confirming, on the theory that a record without it came from an unrecorded, older
// lane. That was backwards and is deliberately not done. `screen_model_8b` is a LIMITATION
// disclosure, not a quality marker: seed_registry_batch appends it only when the run used a
// model other than the 70B default, so the ~1,032 records WITHOUT it are the ones screened by
// the STRONGER llama-3.3-70b-versatile via the demand-priority lane. Gating on it refused to
// confirm the best evidence in the corpus, and would have driven a "re-screen the legacy
// cohort" pass that replaced 70B verdicts with 8B ones - burning a thousand model calls to
// make the corpus worse. Screen-policy currency is governed by POLICY_EPOCH alone.

/**
 * How long a confirmation is good for, measured from the snapshot's own `fetchedAt`.
 *
 * Short ON PURPOSE. The registry sync refreshes the snapshot every ~4h, so 7 days is a ~42x
 * margin against normal jitter, while capping how long a DEAD pipeline stays invisible: if
 * the sync stops, `fetchedAt` stops advancing, `fetchedAt + TTL` slides into the past, and
 * the whole corpus goes amber on its own. The dead-man's switch is this arithmetic - no
 * alert has to fire and no monitoring has to be trusted for staleness to surface.
 */
const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Kill switch for the freshness-confirmation overlay. Default ON. OFF is the more
 * conservative state (every record decays on its stored TTL, the pre-2026-08-04 behavior),
 * so unlike the content-drift switch this one can be flipped without a safety argument -
 * set CONFIRMATION_OVERLAY=0 to revert without a deploy.
 */
export function confirmationOverlayEnabled(): boolean {
  return process.env.CONFIRMATION_OVERLAY !== '0';
}

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
  // AD-3: the observation was made through a credential the OWNER supplied, because the server
  // requires authentication. A single owner-mediated vantage, not an independent one. It must not
  // render at the same visual weight as an unauthenticated observation, and a consumer must be
  // able to filter on it without regex-matching the statement prose.
  credentialed: boolean;
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
  // THE CONTENT BINDING: "sha256:<hex>" of the exact description this screen judged
  // (writer: seed_filesystem.project). applyContentDriftOverlay compares it against the
  // currently published description; a mismatch means the assessment describes text that
  // is no longer live. Optional: 3 records predate it, and fixtures never carry it.
  content_hash?: string;
  // THE SUBJECT BINDING: the registry name this verdict is ABOUT. Optional because 18,543
  // records predate it; getVerdict refuses a record whose server_id is present and does not
  // match the server whose page it landed on. See the comment there.
  server_id?: string;
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
  server_id?: string;
  content_hash?: string;
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
    // `unknown` rather than `boolean?`: this is untrusted store input, and typing it as an
    // optional boolean would let a JSON `"true"` string pass review as if the type system had
    // checked it. The coercer does a strict `=== true`.
    credentialed?: unknown;
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
// Exported for test: the AD-3 `credentialed` disclosure is a claim about EVIDENCE
// PROVENANCE, and its coercion is exactly the kind of one-line boolean check that rots
// silently. `normalize` is module-private, so without this the strictness below could
// only be asserted indirectly through a full store record.
export function coercePreviewBadge(raw: RawVerdict['preview_badge']): PreviewBadge | undefined {
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
    // STRICT true only. Anything else (absent, "true", 1, null) reads false, which is the safe
    // direction for a DISCLOSURE that must never be invented: a badge is only labelled
    // owner-mediated when the writer said so with a real boolean. The opposite failure - dropping
    // a genuine disclosure - is prevented upstream, where the adjudicator fail-closed SKIPS a line
    // whose `credentialed` is present but not a bool rather than coercing it here.
    credentialed: raw.credentialed === true,
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
    content_hash:
      typeof raw.content_hash === 'string' && raw.content_hash ? raw.content_hash : undefined,
    server_id: typeof raw.server_id === 'string' && raw.server_id ? raw.server_id : undefined,
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

/** "sha256:<hex>" of a registry description — MUST mirror the writer (seed_filesystem.project). */
export function descriptionHash(description: string): string {
  return 'sha256:' + createHash('sha256').update(description, 'utf8').digest('hex');
}

function withContentDriftLimit(v: Verdict): Verdict {
  const limits = v.honest_limits ?? [];
  if (limits.includes(CONTENT_DRIFT_LIMIT)) return v;
  return { ...v, honest_limits: [...limits, CONTENT_DRIFT_LIMIT] };
}

/**
 * Read-time content-drift overlay, mirroring applyExpiryOverlay's doctrine exactly:
 * clean drifted → status STALE + content_drift token; drifted with any FAIL axis →
 * append token only (never coerce status away from an accusation signal).
 *
 * `currentDescription` is the description the registry publishes NOW (from the same
 * loadServers() the caller already resolved the subject with). Pass null when the
 * subject cannot be resolved: the overlay is then the identity — deliberately
 * fail-OPEN for staleness, because the alternative (treat unresolvable as stale)
 * flips the entire site to STALE on one snapshot read failure. The resolve-rate
 * healthcheck probe exists to catch this branch silently becoming the common case.
 * A record with no content_hash (3 legacy records; fixtures) is also the identity —
 * there is nothing to compare.
 */
export function applyContentDriftOverlay(
  v: Verdict,
  currentDescription: string | null | undefined,
): Verdict {
  if (currentDescription == null || !v.content_hash) return v;
  if (v.content_hash === descriptionHash(currentDescription)) return v;
  const withLimit = withContentDriftLimit(v);
  if (hasFailAxis(v)) return withLimit;
  if (withLimit.status === 'STALE') return withLimit;
  return { ...withLimit, status: 'STALE' };
}

/**
 * Read-time listing-drift disclosure. See LISTING_CHANGED_LIMIT for why this reports rather
 * than gates.
 *
 * Purely additive: appends one honest-limit and touches nothing else - not `status`, not
 * `directive`, not `dimensions` - so it can neither demote a clean verdict nor soften a
 * flagged one, and its position in the overlay chain does not matter.
 *
 * Fail-closed in the quiet direction: an unusable timestamp on either side says nothing, so
 * we say nothing. Silence here means "no claim", never "nothing changed".
 */
export function applyListingDriftOverlay(
  v: Verdict,
  listingUpdatedAt: string | null | undefined,
): Verdict {
  const updated = Date.parse(listingUpdatedAt ?? '');
  const screened = Date.parse(v.evaluated_at ?? '');
  if (!Number.isFinite(updated) || !Number.isFinite(screened)) return v;
  if (updated <= screened) return v;
  const limits = v.honest_limits ?? [];
  if (limits.includes(LISTING_CHANGED_LIMIT)) return v;
  return { ...v, honest_limits: [...limits, LISTING_CHANGED_LIMIT] };
}

/**
 * Read-time freshness confirmation - the mirror image of applyContentDriftOverlay.
 *
 * WHY THIS EXISTS. `directive.expires_at` is stamped at screen time and nothing ever reset
 * it: SEED_VERDICT_TTL (30 days) was written against a "weekly refresh job" that was never
 * built, so ~1,100 records/day aged into the amber "re-check due" badge. On 2026-08-04 that
 * was 3,565 of 19,542 records - and every one of them was byte-identical to the text it was
 * screened against. We compare each server's published description to its bound
 * `content_hash` on every render already; we simply threw the MATCH away and kept only the
 * mismatch.
 *
 * WHY EXTENDING IS HONEST, AND NOT A RUBBER STAMP. The screen is a pure function of the
 * description (temperature 0, description-only input). If the input is unchanged AND the
 * policy that produced the conclusion is unchanged, re-running it is a no-op that yields no
 * new evidence - so extending the window records a verification we actually performed rather
 * than skipping one. Both halves are required; extending on the hash alone would silently
 * carry a conclusion forward under a screen definition that had since moved.
 *
 * Deliberately NOT re-screening unchanged text: `content_hash` binds a human adjudication to
 * the description only, so a re-screen that flipped PASS->FAIL on identical input would leave
 * the hash unchanged and re-attach an old `cleared` ruling to a brand-new flag no human ever
 * saw. Confirming is not just cheaper than re-screening here, it is safer.
 *
 * The window is anchored to the snapshot's own `fetchedAt`, not to `now`: it keeps the
 * published `expires_at` stable between renders, ties the claim to a real observation, and
 * makes staleness self-enforcing - see CONFIRM_TTL_MS.
 *
 * FAIL-CLOSED at every step. No description, no content_hash, no usable snapshot timestamp,
 * a hash mismatch, or a pre-epoch record all return the verdict untouched, leaving it to
 * decay exactly as it does today. Never shortens an existing window, and never touches
 * `status` or `dimensions` - so it cannot clear an accusation. (computeBadgeState returns on
 * a flagged/held axis before it ever consults expiry, and this overlay's own composition
 * order keeps applyContentDriftOverlay authoritative over a drifted record.)
 */
export function applyConfirmationOverlay(
  v: Verdict,
  currentDescription: string | null | undefined,
  snapshotFetchedAt: string | null | undefined,
): Verdict {
  if (currentDescription == null || !v.content_hash) return v;
  const anchor = Date.parse(snapshotFetchedAt ?? '');
  // A missing/unparseable snapshot timestamp must never read as "fresh": a lagging input is
  // exactly what minted 379 born-stale verdicts in July 2026.
  if (!Number.isFinite(anchor)) return v;
  if (v.content_hash !== descriptionHash(currentDescription)) return v;

  const limits = v.honest_limits ?? [];
  // Screen-policy currency is a DATE question, not a model-tier one (see POLICY_TOKEN note
  // above). An undated record cannot be shown to post-date the epoch, so it is never confirmed.
  const evaluatedAt = Date.parse(v.evaluated_at ?? '');
  const epoch = Date.parse(POLICY_EPOCH);
  if (!Number.isFinite(evaluatedAt) || evaluatedAt < epoch) return v;

  const extended = anchor + CONFIRM_TTL_MS;
  const current = Date.parse(v.directive.expires_at);
  // Monotonic: a record whose own window already runs longer keeps it.
  if (Number.isFinite(current) && current >= extended) return v;
  return {
    ...v,
    directive: { ...v.directive, expires_at: new Date(extended).toISOString() },
    honest_limits: limits.includes(FRESHNESS_CONFIRMED_LIMIT)
      ? limits
      : [...limits, FRESHNESS_CONFIRMED_LIMIT],
  };
}

let _loadInflight: Promise<Record<string, Verdict>> | null = null;

// De-dup concurrent cold loads, mirroring registry.ts's _resolveInflight. Without this, N
// simultaneous callers on a cold instance EACH read and JSON.parse the 12.7MB verdict store
// and normalize ~10.6k records. /api/v1/preflight resolves this store AND the 24.5MB registry
// snapshot in one request, so a traffic spike or a parallel crawl multiplied that footprint
// per in-flight request - the same shape as the OOM that made registry.ts adopt the pattern.
// Sharing one load also guarantees concurrent callers see the SAME store generation.
async function loadAll(): Promise<Record<string, Verdict>> {
  if (_cache) return _cache;
  if (_loadInflight) return _loadInflight;
  _loadInflight = loadAllUncached().finally(() => {
    _loadInflight = null;
  });
  return _loadInflight;
}

async function loadAllUncached(): Promise<Record<string, Verdict>> {
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

/**
 * Does this record claim to be about this server?
 *
 * A SECOND, INDEPENDENT subject binding. The slug alone used to be the only thing tying a
 * verdict to a server, so any slug bug became a wrong-subject verdict rendered under
 * someone else's name — the one failure a trust product cannot have. The store is keyed by
 * the trust side's slug derivation; this asks the RECORD who it is about and refuses when
 * the two disagree, so misattribution now requires both mechanisms to fail at once.
 *
 * A record with no `server_id` still binds: ~18,543 predate the field and failing them
 * closed would blank the site. Those rest on the slug space being injective by construction
 * (`registry.ts` `withDisambiguator`); everything written since carries the field.
 *
 * Exported and shared rather than inlined, because a guard on one accessor and not its
 * siblings is a false sense of safety — `listScreened` reads the same store by slug and
 * would otherwise count a mismatched record toward published coverage.
 */
export function verdictBindsSubject(v: Verdict, subjectName: string): boolean {
  return !v.server_id || v.server_id === subjectName;
}

// Bind a verdict to a registry subject by FINAL slug only. No base-key fallback:
// slugify collisions are disambiguated in loadServers; store keys under the retired
// bare slug must not attach to either twin (wrong-subject PASS).
export async function getVerdict(slug: string): Promise<Verdict | null> {
  const servers = await loadServers();
  const subject = servers.find((s) => s.slug === slug);
  if (!subject) return null;
  return selectVerdictForSubject(await loadAll(), subject, await snapshotFetchedAt());
}

/**
 * The snapshot's own `fetchedAt`, or null if it cannot be established.
 *
 * Goes through loadSnapshotMeta, which serves this from the server-index artifact HEADER
 * when one is present. That matters: reading data/snapshot.json for the timestamp would
 * reintroduce the 26MB read + zod parse the artifact exists to avoid, on ~19.4k tail pages
 * whose only visitor is a crawler (which never populates the edge cache). Do not "simplify"
 * this to a direct snapshot read.
 *
 * Returns null rather than throwing: confirmation is an enhancement, and a verdict that
 * simply decays on its stored TTL is the safe outcome.
 */
async function snapshotFetchedAt(): Promise<string | null> {
  try {
    return (await loadSnapshotMeta()).fetchedAt || null;
  } catch {
    return null;
  }
}

/**
 * Pick the verdict a subject is entitled to, from an already-loaded store.
 *
 * Split out from `getVerdict` so every rule here is unit-testable. `getVerdict` reads two
 * real files, so its body could not be exercised in tests: deleting the subject-binding
 * check from it left the whole suite green, while the check's own predicate was pinned.
 * Testing the helper and not the wiring is a pin that asserts nothing, so the wiring is now
 * a single delegation with no logic of its own to lose.
 */
export function selectVerdictForSubject(
  all: Record<string, Verdict>,
  // `updatedAt` rides along for the listing-drift disclosure. Widened rather than added as a
  // separate arg so the two selectors keep taking the SAME subject shape.
  subject: { slug: string; name: string; description?: string; updatedAt?: string },
  // Required, not optional, for the same reason subjectBySlug carries `description`: if one
  // selector confirmed freshness and the other did not, the leaderboard and the server's own
  // page would disagree about staleness - on a trust surface, the surfaces disagreeing IS the
  // defect. A stale call site must be a compile error, not a silently unconfirmed listing.
  snapshotFetchedAt: string | null,
): Verdict | null {
  // Object.hasOwn guards against prototype keys (e.g. "__proto__") resolving to
  // the prototype object rather than a real verdict.
  const v = Object.hasOwn(all, subject.slug) ? all[subject.slug] : undefined;
  if (!v || v.fixture) return null;
  if (!verdictBindsSubject(v, subject.name)) return null;
  // ORDER IS LOAD-BEARING - do not reorder. Confirmation must run FIRST so the clock check
  // evaluates the extended window; drift must run LAST so a record whose text has moved is
  // marked STALE even if confirmation somehow extended it (it cannot today - confirmation
  // requires a hash match - but the ordering keeps drift authoritative by construction
  // rather than by argument). Before confirmation existed these two were genuinely
  // order-independent; that is no longer true.
  const description = subject.description ?? null;
  return applyListingDriftOverlay(
    applyContentDriftOverlay(
      applyExpiryOverlay(
        confirmationOverlayEnabled()
          ? applyConfirmationOverlay(v, description, snapshotFetchedAt)
          : v,
      ),
      contentDriftOverlayEnabled() ? description : null,
    ),
    subject.updatedAt ?? null,
  );
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
  // {name, description} — not just name: selectScreened applies the SAME content-drift
  // overlay as selectVerdictForSubject. One selector marking a record STALE while the
  // other serves it live would have the leaderboard disagreeing with the server's own
  // page — on a trust surface the surfaces disagreeing IS the defect.
  const subjectBySlug = new Map(
    servers.map((s) => [
      s.slug,
      { name: s.name, description: s.description, updatedAt: s.updatedAt },
    ]),
  );
  return selectScreened(
    await loadAll(),
    subjectBySlug,
    Date.now(),
    await snapshotFetchedAt(),
  );
}

/**
 * The screened set, from an already-loaded store. Pure, so its rules are testable — the
 * accessor above reads two real files, and a guard that only exists inside it cannot be
 * exercised (dropping the subject binding there left the whole suite green).
 */
export function selectScreened(
  all: Record<string, Verdict>,
  // Widened from `slug -> name` when the content-drift overlay landed, so a stale call
  // site is a compile error rather than a silently overlay-free listing.
  subjectBySlug: ReadonlyMap<string, { name: string; description?: string; updatedAt?: string }>,
  now: number,
  // Required for the same reason as on selectVerdictForSubject: the two selectors must apply
  // the SAME freshness rules or the leaderboard and the server page disagree.
  snapshotFetchedAt: string | null,
): Array<{ slug: string; verdict: Verdict }> {
  const validSlugs = new Set(subjectBySlug.keys());
  return Object.entries(all)
    // `!v.unscreened` matters as much as `!v.fixture`: a preview-only record is a minted
    // owner badge for a server the platform never screened. Counting it as "screened" would
    // inflate verdict_coverage.screened_servers in the public machine descriptor
    // (/.well-known/mcp-index.json) - i.e. overstate our own coverage, the one number a
    // trust product must never round up. Zero such records exist today; the owner P1-P4
    // flow is live, so the first external claim would have started the drift.
    // `verdictBindsSubject` for the same reason getVerdict applies it: a record whose
    // server_id names a different server must not be counted as that server's screen, or
    // verdict_coverage.screened_servers overstates our own coverage using someone else's
    // record — the one number a trust product must never round up.
    .filter(
      ([slug, v]) =>
        validSlugs.has(slug) &&
        !v.fixture &&
        !v.unscreened &&
        verdictBindsSubject(v, subjectBySlug.get(slug)?.name ?? ''),
    )
    .map(([slug, v]) => {
      // Same load-bearing order as selectVerdictForSubject: confirm, then clock, then drift.
      const description = subjectBySlug.get(slug)?.description ?? null;
      return {
        slug,
        verdict: applyListingDriftOverlay(
          applyContentDriftOverlay(
            applyExpiryOverlay(
              confirmationOverlayEnabled()
                ? applyConfirmationOverlay(v, description, snapshotFetchedAt)
                : v,
              now,
            ),
            contentDriftOverlayEnabled() ? description : null,
          ),
          subjectBySlug.get(slug)?.updatedAt ?? null,
        ),
      };
    })
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
