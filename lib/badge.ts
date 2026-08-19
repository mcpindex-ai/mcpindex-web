// Embeddable verdict badge (shields-style SVG). Pure + deterministic: state is
// derived from the SAME free-tier verdict the /server/[slug] page renders, so
// the badge, the page, and the /api/v1/trust API never disagree (one source of
// truth). The badge carries NO server-controlled text - only "mcpindex" + a
// fixed state label - so there is no SVG-injection surface.
//
// HONESTY BOUNDARY (enforced by scripts/check-graduation-honesty.mjs): a
// semantic-only screen is advisory; it is NOT a safety certification. The badge
// never says safe/verified/trusted/secure/certified, and never shows a green
// "ALLOW" state - none exists pre-conformance. "screened" means we ran the
// description poison-screen and it passed, nothing more.

import { SCHEMA_CONTENT_DIMENSION_ID, isVerdictExpired, type Verdict } from './verdicts';

export type BadgeState = 'screened' | 'flagged' | 'review' | 'not-screened' | 'stale';

type Style = { right: string; color: string };

// Right-hand label + fill per state. Colors are deliberately NOT emerald/green:
// green is reserved for a future real ALLOW (post-conformance graduation).
// The clean state's public label is "drift-monitored", not "screened": a
// verdict-shaped word in a foreign README reads as an endorsement the first
// time a badged server misbehaves, while "drift-monitored" claims only what
// the crawler provably does for every indexed server. The screen still gates
// the state (a screen FAIL demotes it); the label just stops leading with it.
export const BADGE_STYLE: Record<BadgeState, Style> = {
  screened: { right: 'drift-monitored', color: '#0e7490' }, // cyan-700 (informational)
  flagged: { right: 'flagged', color: '#b91c1c' }, // red-700
  review: { right: 'review', color: '#b45309' }, // amber-700
  stale: { right: 're-check due', color: '#a16207' }, // amber-700 (dim)
  'not-screened': { right: 'not screened', color: '#71717a' }, // zinc-500
};

// State is derived from the same signals the page uses (status + dimensions +
// human adjudication + directive.expires_at). Expiry demotes only a *clean*
// presentation to "stale"; it never hides flagged / held review (accusation-first).
// Fail-closed: no verdict, an errored verdict (after the accusation gate), or any
// dimension FAIL never resolves to "screened" on its own.
//
// THE ACCUSATION GATE: a raw SCREEN flag never publicly accuses a server. Only a
// human-`confirmed` adjudication renders "flagged"; a `cleared` adjudication
// overturns a false positive (e.g. an honest tool over-flagged on phrasing) to
// "screened"; an UNREVIEWED flag is HELD as "review" - neither clean nor accused.
// This is the publish gate: "flagged" is reachable ONLY through `confirmed`.
// Split a verdict's FAIL dimensions onto two INDEPENDENT axes. The per-verdict
// `adjudication` governs ONLY the semantic screen flag (`screenFail`); a deterministic
// schema-content FAIL is a separate axis that must never be cleared/escalated by it.
// Exported so the badge gate AND the server page apply the SAME split - one source of
// truth for a security-load-bearing predicate, no drift between the two surfaces.
export function splitFlags(v: Verdict): { schemaContentFail: boolean; screenFail: boolean } {
  return {
    schemaContentFail: v.dimensions.some(
      (d) => d.id === SCHEMA_CONTENT_DIMENSION_ID && d.verdict === 'FAIL',
    ),
    screenFail: v.dimensions.some(
      (d) => d.id !== SCHEMA_CONTENT_DIMENSION_ID && d.verdict === 'FAIL',
    ),
  };
}

export function computeBadgeState(v: Verdict | null, now: number = Date.now()): BadgeState {
  if (!v) return 'not-screened';

  // A deterministic schema-content FAIL must NEVER be auto-cleared by a `cleared` screen
  // adjudication (a fail-OPEN: a poisoned schema silently passed) nor auto-escalated to
  // public "flagged" by a `confirmed` one. It independently HOLDS the badge at "review".
  const { schemaContentFail, screenFail: screenFlagged } = splitFlags(v);
  const expired = v.status === 'STALE' || isVerdictExpired(v, now);

  if (screenFlagged) {
    // A `confirmed` screen flag renders "flagged" EVEN IF a schema-content FAIL is
    // also held. This is intentional, not a masking bug: "flagged" is strictly more
    // severe than the schema hold's "review", so it is never a fail-open (nothing
    // bad is hidden - a viewer still sees red, not clean). The schema hold is NOT
    // lost: the /server page renders its own "schema flag - held" box unconditionally
    // on schemaContentFail (page.tsx), and the held-adjudication healthcheck probe
    // holds the record until the schema axis is reviewed. Do NOT downgrade this to
    // "review" - that would hide a human-confirmed accusation. (badge.test.ts pins it.)
    // Accusation-first: confirmed/unreviewed FAIL never become stale or not-screened
    // solely due to expiry or ERROR status.
    if (v.adjudication?.decision === 'confirmed') return 'flagged';
    // a cleared SCREEN flag still cannot clear an unreviewed schema-content FAIL
    if (v.adjudication?.decision === 'cleared') {
      if (schemaContentFail) return 'review';
      return expired ? 'stale' : 'screened';
    }
    return 'review'; // unreviewed screen flag - held, never a public accusation
  }
  if (schemaContentFail) return 'review'; // deterministic FAIL holds review, ungoverned by adjudication

  // ERROR after accusation gate: a confirmed FAIL above already returned flagged;
  // unparseable/errored clean records stay gray.
  if (v.status === 'ERROR') return 'not-screened';
  if (expired) return 'stale';

  const integ = v.dimensions.find((d) => d.id === 'mcpindex.integrity.description');
  if (integ && integ.verdict === 'PASS') return 'screened';
  return 'review'; // verdict present but no clean integrity pass
}

const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';
const LEFT = 'mcpindex';
const H = 20;

// Approx advance width per char at 11px Verdana + padding. Not pixel-perfect;
// just wide enough that the two pills never overlap or clip the text.
function pillWidth(s: string): number {
  return Math.ceil(s.length * 6.5) + 14;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderTwoPillSvg(right: string, color: string): string {
  const lw = pillWidth(LEFT);
  const rw = pillWidth(right);
  const w = lw + rw;
  const aria = escapeXml(`mcpindex: ${right}`);
  const leftText = escapeXml(LEFT);
  const rightText = escapeXml(right);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${H}" role="img" aria-label="${aria}">`,
    `<title>${aria}</title>`,
    `<rect width="${lw}" height="${H}" fill="#0a0a0a"/>`,
    `<rect x="${lw}" width="${rw}" height="${H}" fill="${color}"/>`,
    `<g fill="#ffffff" font-family="${FONT}" font-size="11" text-anchor="middle">`,
    `<text x="${lw / 2}" y="14">${leftText}</text>`,
    `<text x="${lw + rw / 2}" y="14">${rightText}</text>`,
    `</g>`,
    `</svg>`,
  ].join('');
}

// All inputs are fixed module constants (LEFT, BADGE_STYLE labels) - never
// request data - so no escaping is required; there is nothing external to inject.
export function renderBadgeSvg(state: BadgeState): string {
  const { right, color } = BADGE_STYLE[state];
  return renderTwoPillSvg(right, color);
}

// Corpus / coverage stats for README social proof. Not a verdict badge — never
// says safe/verified/certified. Color stays informational teal (same as
// "screened"), never green (reserved for post-conformance ALLOW).
export type MetaBadgeKind = 'servers' | 'screened';

const META_STYLE: Record<MetaBadgeKind, { suffix: string; color: string }> = {
  servers: { suffix: 'servers', color: '#0e7490' },
  screened: { suffix: 'screened', color: '#0e7490' },
};

export function renderStatBadgeSvg(kind: MetaBadgeKind, count: number): string {
  const n = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
  const { suffix, color } = META_STYLE[kind];
  const right = `${n.toLocaleString('en-US')} ${suffix}`;
  return renderTwoPillSvg(right, color);
}
