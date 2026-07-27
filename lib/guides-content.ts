// Loader for agency-published guide pages committed under content/guides/*.json.
// These are intent-driven pages (comparisons, how-tos, "is X safe") anchored in
// mcpindex's trust data - NOT per-server duplicates of /server/[slug]. Each file
// is a JSON artifact from the growth agency (human-merged PR). Build-time fs read
// + process-lifetime cache (mirrors lib/registry.ts). Tolerates a missing/empty
// dir (the /guides section is a no-op until pages land); malformed files skipped.

import fs from 'node:fs/promises';
import path from 'node:path';
import { isSafeHref } from './safeUrl';

export interface FaqItem {
  q: string;
  a: string; // plain text (goes into FAQPage acceptedAnswer); no markdown
}

// --- Walkthrough extension (kind: "walkthrough") -----------------------------
// An additive, optional layer over the classic guide. A guide carrying `steps`
// renders as a numbered, in-product walkthrough (components/GuideWalkthrough);
// a guide without them renders exactly as before (flat markdown `body`). Every
// field is optional and fail-safe so the 8 existing SEO guides are untouched.

/** "open X, look for Y" callout to a live product page (self-maintaining: the
 *  page is always current). Used where a step needs real data/state we won't
 *  snapshot (e.g. /ledger, /receipts, /server/[slug]). */
export interface StepDeepLink {
  href: string; // internal route ("/receipts") or full URL
  label: string; // link text
  lookFor: string; // one line: what to notice on that page
}

export interface WalkStep {
  id: string; // stable anchor within the guide (auto-filled to "step-N" if absent)
  heading: string;
  body: string; // markdown (rendered with the shared `md` renderers)
  /** EmbedKey resolved at render time against EMBED_REGISTRY (lib/guide-embeds).
   *  Kept as a bare string here so this build-time loader stays React-free and
   *  an unknown key degrades gracefully in the renderer, never breaks the build. */
  embed?: string;
  deepLink?: StepDeepLink;
  troubleshoot?: string; // optional markdown ("If you don't see the HOLD…")
}

/** End-of-guide CTA that chains the reader into the next journey (the funnel). */
export interface GuideNext {
  href: string;
  label: string;
}

/** Top-of-guide "see the payoff first" jump to an embedded demo step. */
export interface GuideImpatient {
  label: string; // "Watch a drift get held first"
  targetId: string; // a step id to anchor-jump to
}

export interface Guide {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  body: string;
  citationIds: string[]; // e.g. "mcpindex-snapshot:github-mcp" -> the /server card
  project: string;
  updated?: string; // ISO date, if the artifact carries one (drives sitemap lastmod)
  faq?: FaqItem[]; // optional Q&A pairs -> FAQPage JSON-LD (answer-engine extraction)
  /** Figure ids (lib/diagrams.ts) rendered after the body. Classic guides have no steps to
   *  hang an embed off; this is their placement channel. Unknown ids degrade in the renderer. */
  figures?: string[];
  // --- walkthrough fields (all optional) ---
  kind?: 'walkthrough'; // absence = classic flat-body guide
  order?: number; // funnel position in the /guides index (lower = earlier)
  outcome?: string; // "What you'll have at the end" (claim-first banner)
  estMinutes?: number; // time-to-value; drives HowTo totalTime
  impatient?: GuideImpatient; // top-of-guide jump to the aha
  steps?: WalkStep[]; // the numbered walkthrough; empty/absent => flat-body render
  next?: GuideNext; // funnel CTA to the next journey
  dependsOn?: string[]; // repo-relative paths the freshness probe watches
}

const GUIDES_DIR = path.join(process.cwd(), 'content', 'guides');
// slug becomes a URL segment + matched a filename: bounded lowercase/hyphen only
// (same shape the producer enforces). Reject anything traversable.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

let _cache: Record<string, Guide> | null = null;

// A real calendar date with an optional ISO time. Rejects trailing junk and
// rollover dates like 2026-02-30 (Date.parse would silently roll those to Mar 2).
// UTC construction keeps the day-validity check timezone-independent.
function isRealIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

// Exported for unit tests (pure fn; the fs loader below is the only other caller).
export function coerceGuide(raw: unknown, slugFromFile: string): Guide | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const slug = str(r.slug) || slugFromFile;
  if (!SLUG_RE.test(slug)) return null;
  const title = str(r.title);
  const h1 = str(r.h1);
  const body = str(r.body);
  if (!title || !h1 || !body) return null; // presence floor mirrors the producer
  // Only accept an ISO-ish date; a junk `updated` would emit invalid
  // datePublished/dateModified in the TechArticle JSON-LD and a bad sitemap lastmod.
  const updatedRaw = str(r.updated) || str(r.updated_at);
  // Accept only a fully-anchored ISO date (optional time) whose Y-M-D is a REAL
  // calendar date, so neither trailing junk ("2026-07-15x") nor a rollover
  // ("2026-02-30", which Date.parse silently rolls to Mar 2) reaches the JSON-LD
  // datePublished/dateModified. UTC construction keeps the day-validity check
  // timezone-independent.
  const updated = isRealIsoDate(updatedRaw) ? updatedRaw : '';
  const faq = coerceFaq(r.faq);
  const steps = coerceSteps(r.steps);
  const kind = str(r.kind) === 'walkthrough' ? ('walkthrough' as const) : undefined;
  const order =
    typeof r.order === 'number' && Number.isFinite(r.order) ? r.order : undefined;
  const outcome = str(r.outcome);
  const estMinutes =
    typeof r.est_minutes === 'number' && Number.isFinite(r.est_minutes) && r.est_minutes > 0
      ? r.est_minutes
      : undefined;
  const impatient = coerceImpatient(r.impatient, new Set(steps.map((s) => s.id)));
  const next = coerceNext(r.next);
  const dependsOn = list(r.depends_on);
  // Figure ids are slugs; the renderer resolves them against lib/diagrams.ts and degrades on a
  // miss, so no registry import is needed here (this loader stays React-free by design).
  const figures = list(r.figures).filter((f) => SLUG_RE.test(f));
  return {
    slug,
    title,
    metaDescription: str(r.meta_description),
    h1,
    body,
    citationIds: list(r.citation_ids),
    project: str(r.project),
    ...(updated ? { updated } : {}),
    ...(faq.length ? { faq } : {}),
    ...(kind ? { kind } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(outcome ? { outcome } : {}),
    ...(estMinutes ? { estMinutes } : {}),
    ...(impatient ? { impatient } : {}),
    ...(steps.length ? { steps } : {}),
    ...(figures.length ? { figures } : {}),
    ...(next ? { next } : {}),
    ...(dependsOn.length ? { dependsOn } : {}),
  };
}

// Walkthrough steps -> validated WalkStep[]; tolerant of malformed entries (skip,
// never throw). A step needs at least a heading + body; `id` auto-fills to
// "step-N" (1-based over surviving steps) so anchors stay stable and meaningful.
function coerceSteps(v: unknown): WalkStep[] {
  if (!Array.isArray(v)) return [];
  const out: WalkStep[] = [];
  const usedIds = new Set<string>();
  for (const it of v) {
    if (!it || typeof it !== 'object') continue;
    const s = it as Record<string, unknown>;
    const heading = typeof s.heading === 'string' ? s.heading.trim() : '';
    const body = typeof s.body === 'string' ? s.body : '';
    if (!heading || !body.trim()) continue; // presence floor
    const rawId = typeof s.id === 'string' ? s.id.trim() : '';
    // Valid, unused author id wins; otherwise fall back to a positional id and
    // loop past any collision (incl. an author id already sitting in the step-N
    // namespace) so React keys + DOM anchors + HowTo step urls never collide.
    let id: string;
    if (SLUG_RE.test(rawId) && !usedIds.has(rawId)) {
      id = rawId;
    } else {
      let n = out.length + 1;
      id = `step-${n}`;
      while (usedIds.has(id)) id = `step-${++n}`;
    }
    usedIds.add(id);
    const embed = typeof s.embed === 'string' && s.embed.trim() ? s.embed.trim() : undefined;
    const deepLink = coerceDeepLink(s.deep_link);
    const troubleshoot =
      typeof s.troubleshoot === 'string' && s.troubleshoot.trim() ? s.troubleshoot : undefined;
    out.push({
      id,
      heading,
      body,
      ...(embed ? { embed } : {}),
      ...(deepLink ? { deepLink } : {}),
      ...(troubleshoot ? { troubleshoot } : {}),
    });
  }
  return out;
}

function coerceDeepLink(v: unknown): StepDeepLink | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Record<string, unknown>;
  const href = typeof d.href === 'string' ? d.href.trim() : '';
  const label = typeof d.label === 'string' ? d.label.trim() : '';
  const lookFor = typeof d.look_for === 'string' ? d.look_for.trim() : '';
  if (!href || !label || !lookFor || !isSafeHref(href)) return undefined;
  return { href, label, lookFor };
}

function coerceNext(v: unknown): GuideNext | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const n = v as Record<string, unknown>;
  const href = typeof n.href === 'string' ? n.href.trim() : '';
  const label = typeof n.label === 'string' ? n.label.trim() : '';
  if (!href || !label || !isSafeHref(href)) return undefined;
  return { href, label };
}

// The impatient jump must point at a real step, or the anchor goes nowhere.
// Validate target_id against the surviving step ids and drop it otherwise.
function coerceImpatient(v: unknown, stepIds: Set<string>): GuideImpatient | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const i = v as Record<string, unknown>;
  const label = typeof i.label === 'string' ? i.label.trim() : '';
  const targetId = typeof i.target_id === 'string' ? i.target_id.trim() : '';
  if (!label || !targetId || !stepIds.has(targetId)) return undefined;
  return { label, targetId };
}

// Q&A pairs -> validated FaqItem[]; tolerant of malformed entries (skip, never throw).
function coerceFaq(v: unknown): FaqItem[] {
  if (!Array.isArray(v)) return [];
  const out: FaqItem[] = [];
  for (const it of v) {
    if (it && typeof it === 'object') {
      const q = (it as Record<string, unknown>).q;
      const a = (it as Record<string, unknown>).a;
      if (typeof q === 'string' && typeof a === 'string' && q.trim() && a.trim()) {
        out.push({ q: q.trim(), a: a.trim() });
      }
    }
  }
  return out;
}

async function loadAll(): Promise<Record<string, Guide>> {
  if (_cache) return _cache;
  let files: string[] = [];
  try {
    files = await fs.readdir(GUIDES_DIR);
  } catch {
    _cache = Object.create(null) as Record<string, Guide>;
    return _cache;
  }
  // Null-prototype map so a slug like "__proto__" / "constructor" resolves to
  // undefined (-> notFound), not Object.prototype/the Object fn (-> a 500).
  const out: Record<string, Guide> = Object.create(null);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const text = await fs.readFile(path.join(GUIDES_DIR, f), 'utf-8');
      const guide = coerceGuide(JSON.parse(text), f.replace(/\.json$/, ''));
      if (guide) out[guide.slug] = guide;
    } catch {
      // skip a malformed file; never break the build (fail-safe).
    }
  }
  _cache = out;
  return out;
}

export async function loadGuideSlugs(): Promise<string[]> {
  return Object.keys(await loadAll()).sort();
}

export async function getGuide(slug: string): Promise<Guide | null> {
  return (await loadAll())[slug] ?? null;
}

export async function loadGuides(): Promise<Guide[]> {
  return Object.values(await loadAll()).sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
}

// "mcpindex-snapshot:github-mcp" -> "github-mcp"; bare ids pass through.
export function citationToServerSlug(cid: string): string {
  const tail = cid.includes(':') ? cid.slice(cid.lastIndexOf(':') + 1) : cid;
  return SLUG_RE.test(tail) ? tail : '';
}
