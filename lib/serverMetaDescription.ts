/**
 * SERP / OG meta description for /server/[slug].
 *
 * Registry blurbs are short (catalog median ~88 chars) and byte-identical across
 * directories — Bing flags them as too short, and they earned ~0.24% CTR at mid
 * positions. This builder keeps the registry blurb as the lead, then appends an
 * mcpindex-unique inventory of what the page actually surfaces.
 *
 * Honesty rules (do not relax without a product call):
 * - Describe page FEATURES, never per-server OUTCOMES. "description-screen status"
 *   is what the page shows (including "not yet screened"); "screened" / "safe" /
 *   "passed" / a Quality Score number would invent a verdict.
 * - Do NOT claim "source reachability" unless the negative-liveness lead is present.
 *   Reachability status is only published for unavailable sources; absent ≠ healthy.
 * - Suffixes are complete units. Never mid-clip a suffix to chase 150 chars.
 * - Truncate the blurb only when lead+blurb overflows 160, or when even the
 *   shortest required no-liveness suffix will not fit. Do not mangle a liveness
 *   lead+blurb that is already 137–149 just to squeeze in a pad.
 *
 * AEO: "mcpindex listing:" / "listing for agents:" names the entity and document
 * type so agents can attribute the unique signals (screen status, Quality Score).
 */

const META_MIN = 150;
const META_MAX = 160;

/**
 * Short → long. No-liveness inventory only — signals present on every server page.
 * Reachability is intentionally absent here (see file header).
 */
const SUFFIXES = [
  ' Indexed on mcpindex.ai.',
  ' mcpindex listing: description-screen status and Quality Score.',
  ' mcpindex listing: description-screen status and MCP Quality Score.',
  ' mcpindex listing: description-screen status and catalog Quality Score.',
  ' mcpindex.ai listing: description-screen status and MCP Quality Score.',
  ' mcpindex.ai listing for agents: description-screen status and MCP Quality Score.',
] as const;

/** Pads allowed after a liveness lead (reachability already stated in the lead). */
const LIVENESS_PADS = [
  '',
  ' Indexed on mcpindex.ai.',
  ' mcpindex listing: description-screen status and Quality Score.',
] as const;

export type ServerMetaDescriptionInput = {
  description: string;
  name: string;
  title: string;
  /** Present only for the negative liveness case (source not publicly reachable). */
  livenessHttpStatus?: number;
};

function clipBlurb(blurb: string, budget: number): string {
  const trimmed = blurb.trim();
  if (budget <= 0) return '';
  if (trimmed.length <= budget) return trimmed;
  const sliced = trimmed.slice(0, budget);
  const atWord = sliced.includes(' ')
    ? sliced.slice(0, sliced.lastIndexOf(' ')).replace(/[.,;:\s]+$/u, '')
    : sliced.trim();
  return atWord || sliced.trim();
}

function pageLabel(name: string, title: string): string {
  return title && title !== name ? title : name;
}

/**
 * Expand short/garbage blurbs with the page title/name. If the blurb is long enough
 * for the registry but still cannot hit META_MIN with the longest suffix, prefix
 * the label so the SERP names the server (AEO) and clears Bing's length band.
 */
export function expandServerBlurb(description: string, name: string, title: string): string {
  let blurb = description.trim();
  const label = pageLabel(name, title);

  if (blurb.length < 50) {
    if (!blurb || blurb.toLowerCase() === label.toLowerCase()) {
      blurb = `${label} MCP server`;
    } else {
      blurb = `${label} — ${blurb}`;
    }
  }

  const longest = SUFFIXES[SUFFIXES.length - 1];
  if (blurb.length + longest.length < META_MIN) {
    if (!blurb.toLowerCase().startsWith(label.toLowerCase())) {
      blurb = `${label}: ${blurb}`;
    }
  }
  return blurb;
}

function pickSuffix(head: string, options: readonly string[]): string | null {
  const fitting = options.filter((suf) => head.length + suf.length <= META_MAX);
  if (fitting.length === 0) return null;
  const inRange = fitting.filter((suf) => head.length + suf.length >= META_MIN);
  const pool = inRange.length > 0 ? inRange : fitting;
  return pool.reduce((best, suf) => (suf.length >= best.length ? suf : best));
}

/**
 * Build a meta description: registry blurb + mcpindex differentiator.
 * Always ≤160 chars. Targets 150–160 without mangling the blurb or inventing verdicts.
 */
export function buildServerMetaDescription(input: ServerMetaDescriptionInput): string {
  const blurb = expandServerBlurb(input.description, input.name, input.title);
  const hasLiveness = input.livenessHttpStatus !== undefined;
  const lead = hasLiveness
    ? `Source repo returns HTTP ${input.livenessHttpStatus} (may be private or moved). `
    : '';

  if (!hasLiveness) {
    const suf = pickSuffix(blurb, SUFFIXES);
    if (suf !== null) return `${blurb}${suf}`;
    const shortest = SUFFIXES[0];
    return `${clipBlurb(blurb, META_MAX - shortest.length)}${shortest}`;
  }

  const base = `${lead}${blurb}`;
  if (base.length > META_MAX) {
    return `${lead}${clipBlurb(blurb, META_MAX - lead.length)}`;
  }
  if (base.length >= META_MIN) return base;

  // Already unique via the liveness lead. Pad only if a complete pad fits without
  // truncating the blurb; otherwise accept 137–149 rather than mangle the sentence.
  const suf = pickSuffix(base, LIVENESS_PADS);
  if (suf !== null) return `${base}${suf}`;
  return base;
}

/** Exported for tests — the complete suffix units that must never appear partial. */
export const SERVER_META_SUFFIXES = SUFFIXES;
export const SERVER_META_MAX = META_MAX;
export const SERVER_META_MIN = META_MIN;
