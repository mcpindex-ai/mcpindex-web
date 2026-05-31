// Canonical reader for the seeded verdict store (data/verdicts.json), written
// by the internal seed pipeline. One source of truth for both the per-server
// trust panel and the /best evidence directory. Enum case is normalized to the
// UPPERCASE wire convention so the
// store tolerates the contract's lowercase enum values and any future
// live-service output. No HTTP: read once at build/SSG time.

import path from 'node:path';
import { promises as fsp } from 'node:fs';

export type Decision = 'ALLOW' | 'DENY' | 'REVIEW';
export type VerdictStatus = 'EVALUATED' | 'PARTIAL' | 'STALE' | 'ERROR';
export type DimensionVerdict = 'PASS' | 'FAIL' | 'UNVERIFIED' | 'ERROR';
export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Dimension = {
  id: string;
  verdict: DimensionVerdict;
  severity: Severity;
  evidence?: ReadonlyArray<{ quote: string; method?: string }>;
};

export type Verdict = {
  schema_version: '1.0';
  status: VerdictStatus;
  directive: { decision: Decision; rationale: string; expires_at: string };
  dimensions: ReadonlyArray<Dimension>;
  granularity?: string;
  honest_limits?: ReadonlyArray<string>;
  fixture: boolean;
  origin?: string;
  title?: string;
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
  honest_limits?: string[];
  fixture?: boolean;
  origin?: string;
  title?: string;
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

function coerce<T extends string>(s: string | undefined, set: Set<string>, fallback: T): T {
  const u = UP(s);
  return (set.has(u) ? u : fallback) as T;
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
    honest_limits: raw.honest_limits,
    fixture: raw.fixture ?? false,
    origin: raw.origin,
    title: raw.title,
  };
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

// A real registry server's verdict by slug. Returns null when there is no
// verdict OR when the slug is a fixture (fixtures are never real servers and
// must not render on /server/[slug]).
export async function getVerdict(slug: string): Promise<Verdict | null> {
  const all = await loadAll();
  // Object.hasOwn guards against prototype keys (e.g. "__proto__") resolving to
  // the prototype object rather than a real verdict.
  const v = Object.hasOwn(all, slug) ? all[slug] : undefined;
  if (!v || v.fixture) return null;
  return v;
}

// All screened real servers (non-fixture), as [slug, verdict], slug-sorted.
export async function listScreened(): Promise<Array<{ slug: string; verdict: Verdict }>> {
  const all = await loadAll();
  return Object.entries(all)
    .filter(([, v]) => !v.fixture)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, verdict]) => ({ slug, verdict }));
}

// The labeled adversarial fixtures (NOT real servers) for the showcase.
export async function listFixtures(): Promise<Array<{ slug: string; verdict: Verdict }>> {
  const all = await loadAll();
  return Object.entries(all)
    .filter(([, v]) => v.fixture)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, verdict]) => ({ slug, verdict }));
}

export function isFlagged(v: Verdict): boolean {
  return v.dimensions.some((d) => d.verdict === 'FAIL');
}
