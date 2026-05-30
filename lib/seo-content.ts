// Loader for agency-published SEO pages committed under content/seo/*.json.
// Each file is a SeoArtifact from the growth agency (PR-merged, human-reviewed).
// Build-time fs read + process-lifetime cache (mirrors lib/registry.ts). Tolerates
// a missing/empty dir (returns nothing) so the /seo section is a no-op until pages
// land. Malformed files are skipped, never crash the build.

import fs from 'node:fs/promises';
import path from 'node:path';

export interface SeoContent {
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  body: string;
  internalLinks: string[];
  citationIds: string[];
  project: string;
}

const SEO_DIR = path.join(process.cwd(), 'content', 'seo');
// slug becomes a URL segment + matched a filename: same bounded lowercase/hyphen
// shape the producer enforces (signals.topics.is_valid_slug). Reject anything else.
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,99}$/;

let _cache: Record<string, SeoContent> | null = null;

function coerce(raw: unknown, slugFromFile: string): SeoContent | null {
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
  // presence floor mirrors the producer guardrail: no empty/garbage pages.
  if (!title || !h1 || !body) return null;
  return {
    slug,
    title,
    metaDescription: str(r.meta_description),
    h1,
    body,
    internalLinks: list(r.internal_links),
    citationIds: list(r.citation_ids),
    project: str(r.project),
  };
}

async function loadAll(): Promise<Record<string, SeoContent>> {
  if (_cache) return _cache;
  let files: string[] = [];
  try {
    files = await fs.readdir(SEO_DIR);
  } catch {
    _cache = {};
    return _cache;
  }
  const out: Record<string, SeoContent> = {};
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const text = await fs.readFile(path.join(SEO_DIR, f), 'utf-8');
      const content = coerce(JSON.parse(text), f.replace(/\.json$/, ''));
      if (content) out[content.slug] = content;
    } catch {
      // skip a malformed file; never break the build (fail-safe).
    }
  }
  _cache = out;
  return out;
}

export async function loadSeoSlugs(): Promise<string[]> {
  return Object.keys(await loadAll()).sort();
}

export async function getSeoContent(slug: string): Promise<SeoContent | null> {
  return (await loadAll())[slug] ?? null;
}

export async function loadSeoContent(): Promise<SeoContent[]> {
  return Object.values(await loadAll()).sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
}
