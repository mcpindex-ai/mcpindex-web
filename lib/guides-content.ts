// Loader for agency-published guide pages committed under content/guides/*.json.
// These are intent-driven pages (comparisons, how-tos, "is X safe") anchored in
// mcpindex's trust data - NOT per-server duplicates of /server/[slug]. Each file
// is a JSON artifact from the growth agency (human-merged PR). Build-time fs read
// + process-lifetime cache (mirrors lib/registry.ts). Tolerates a missing/empty
// dir (the /guides section is a no-op until pages land); malformed files skipped.

import fs from 'node:fs/promises';
import path from 'node:path';

export interface FaqItem {
  q: string;
  a: string; // plain text (goes into FAQPage acceptedAnswer); no markdown
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
}

const GUIDES_DIR = path.join(process.cwd(), 'content', 'guides');
// slug becomes a URL segment + matched a filename: bounded lowercase/hyphen only
// (same shape the producer enforces). Reject anything traversable.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

let _cache: Record<string, Guide> | null = null;

function coerce(raw: unknown, slugFromFile: string): Guide | null {
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
  const updated = str(r.updated) || str(r.updated_at);
  const faq = coerceFaq(r.faq);
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
  };
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
    _cache = {};
    return _cache;
  }
  const out: Record<string, Guide> = {};
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const text = await fs.readFile(path.join(GUIDES_DIR, f), 'utf-8');
      const guide = coerce(JSON.parse(text), f.replace(/\.json$/, ''));
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
