import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServer, loadServers } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';
import { CATEGORY_LABELS } from '@/lib/categorize';
import { D3_PROGRESS } from '@/lib/honest-limits';
import { CopyField } from '@/components/CopyField';
import {
  getVerdict,
  type Verdict as FreeTierVerdict,
  type Decision,
  type Severity,
  type DimensionVerdict,
} from '@/lib/verdicts';
import { splitFlags } from '@/lib/badge';
import { loadServerDrift } from '@/lib/serverDriftServer';
import type { ServerDrift } from '@/lib/serverDrift';

// Trust verdict shape (free-tier projection of the v1.0.0 verdict contract).
// History and Provenance are deliberately omitted: anonymous surfaces never
// return back-history (the un-backfillable moat; authenticated tier only).
//
// Three rendering states for the trust panel, all FAIL-CLOSED (no ALLOW, no
// green unless a real EVALUATED verdict says so):
//   verdict     -> render the populated FreeTierVerdict
//   unverified  -> reachable, no verdict yet (v1 default for ~all servers)
//   unavailable -> verdict service unreachable
type VerdictState =
  | { kind: 'verdict'; verdict: FreeTierVerdict }
  | { kind: 'unverified' }
  | { kind: 'unavailable' };

async function loadVerdictForServer(slug: string): Promise<VerdictState> {
  const verdict = await getVerdict(slug);
  return verdict ? { kind: 'verdict', verdict } : { kind: 'unverified' };
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const servers = await loadServers();
  return servers.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await ctx.params;
  const server = await getServer(slug);
  if (!server) return { title: 'Server not found' };
  return {
    title: `${server.title} - ${server.name}`,
    description: server.description,
    alternates: { canonical: `https://mcpindex.ai/server/${server.slug}` },
    openGraph: {
      title: server.title,
      description: server.description,
      url: `https://mcpindex.ai/server/${server.slug}`,
      type: 'website',
      images: [`/server/${server.slug}/og`],
    },
    twitter: {
      card: 'summary_large_image',
      title: server.title,
      description: server.description,
      images: [`/server/${server.slug}/og`],
    },
  };
}

export default async function ServerPage(
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const server = await getServer(slug);
  if (!server) notFound();

  const all = await loadServers();
  const { score, breakdown } = computeQuality(server);
  const installs = buildInstalls(server);
  const verdictState = await loadVerdictForServer(server.slug);
  // Server-level drift, joined from the public ledger by this server's fingerprint (server.name is
  // the crawl's server_id). null = ledger off/unavailable -> render nothing, never a false "clean".
  const drift = await loadServerDrift(server.name);
  const alternatives = all
    .filter((s) => s.category === server.category && s.slug !== server.slug)
    .slice(0, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: server.title,
    alternateName: server.name,
    description: server.description,
    softwareVersion: server.version,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Cross-platform',
    url: `https://mcpindex.ai/server/${server.slug}`,
    sameAs: [server.repositoryUrl, server.websiteUrl].filter(
      (u): u is string => {
        if (!u) return false;
        try {
          const p = new URL(u).protocol;
          return p === 'http:' || p === 'https:';
        } catch {
          return false;
        }
      },
    ),
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: score,
      ratingCount: 1,
      bestRating: 100,
      worstRating: 0,
    },
  };

  // Belt-and-suspenders URL scheme check (normalize() already strips non-http(s)
  // at registry load; this guards future code paths that bypass it).
  const isSafeHref = (u: string | undefined): u is string => {
    if (!u) return false;
    try {
      const p = new URL(u).protocol;
      return p === 'http:' || p === 'https:';
    } catch {
      return false;
    }
  };
  const repoHref = isSafeHref(server.repositoryUrl) ? server.repositoryUrl : undefined;
  const siteHref = isSafeHref(server.websiteUrl) ? server.websiteUrl : undefined;
  const remoteHref = isSafeHref(server.remoteUrl) ? server.remoteUrl : undefined;

  // Operator / publisher, npm "publisher" analog: repo owner, else name namespace.
  let operator: string | null = null;
  if (repoHref) {
    try {
      const seg = new URL(repoHref).pathname.split('/').filter(Boolean);
      operator = seg[0] ?? null;
    } catch {
      operator = null;
    }
  }
  if (!operator && server.name.includes('/')) operator = server.name.split('/')[0];

  const freshUntil =
    verdictState.kind === 'verdict' && verdictState.verdict.directive.expires_at
      ? verdictState.verdict.directive.expires_at.slice(0, 10)
      : null;

  const RAIL_LABEL =
    'font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-3';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="site-container pt-12 pb-24">
        <Link
          href="/leaderboard"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-mute)] hover:text-[var(--color-accent)]"
        >
          ← Index
        </Link>

        <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-10 lg:gap-16 items-start">
          {/* ───────────────── MAIN COLUMN ───────────────── */}
          <main className="min-w-0">
            <h1 className="t-page-h1 font-medium text-[var(--color-ink)]">{server.title}</h1>
            <div className="mt-3 font-mono text-[12px] text-[var(--color-mute)] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{server.name}</span>
              <span className="text-[var(--color-rule)]">·</span>
              <span>v{server.version}</span>
              <span className="text-[var(--color-rule)]">·</span>
              <Link
                href={`/best/${server.category}`}
                className="text-[var(--color-cite)] hover:text-[var(--color-accent)]"
              >
                {CATEGORY_LABELS[server.category] ?? server.category}
              </Link>
            </div>

            <p className="mt-6 text-[17px] leading-[1.55] text-[var(--color-cite)]">
              {server.description}
            </p>

            {/* Verdict = the hero metric (npm puts downloads here; we put trust). */}
            <section className="mt-10">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
                Trust verdict&nbsp;·&nbsp;v1 advisory&nbsp;·&nbsp;
                <Link href="/methodology" className="hover:text-[var(--color-accent)]">
                  method
                </Link>
              </div>
              <TrustVerdictPanel state={verdictState} />
              <p className="mt-3 font-mono text-[11px] text-[var(--color-mute)]">
                Own this server?{' '}
                <Link href="/screen" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
                  Screen its description →
                </Link>
              </p>
            </section>

            <ContractDriftSection drift={drift} />

            {/* Embed badge - puts the live verdict next to "Connect" wherever
                this server is listed. Reflects the current screen and links back. */}
            {verdictState.kind === 'verdict' && (
              <section className="mt-14">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
                  Embed this badge
                </div>
                <p className="text-[13px] leading-[1.55] text-[var(--color-cite)] mb-3">
                  A live verdict badge for your README or listing. It reflects the current screen,
                  links back here, and updates when the verdict does.
                </p>
                <CopyField
                  label="Markdown"
                  value={`[![mcpindex](https://mcpindex.ai/api/v1/badge/${server.slug})](https://mcpindex.ai/server/${server.slug})`}
                />
                <CopyField
                  label="HTML"
                  value={`<a href="https://mcpindex.ai/server/${server.slug}"><img src="https://mcpindex.ai/api/v1/badge/${server.slug}" alt="mcpindex verdict" height="20" /></a>`}
                />
              </section>
            )}

            {/* Env vars */}
            {server.envVars.length > 0 && (
              <section className="mt-14">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
                  Environment variables
                </div>
                <div className="rule-t">
                  {server.envVars.map((v) => (
                    <div
                      key={v.name}
                      className="rule-b row-3up-wide py-4 px-2"
                    >
                      <code className="font-mono text-[13px] text-[var(--color-ink)]">{v.name}</code>
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)] flex gap-2">
                        {v.isRequired && <span className="text-[var(--color-accent)]">required</span>}
                        {v.isSecret && <span>secret</span>}
                      </div>
                      <p className="text-[13px] text-[var(--color-cite)]">
                        {v.description ?? (
                          <span className="text-[var(--color-mute)]">no description</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Quality breakdown - subordinated: popularity/maturity is NOT trust. */}
            <section className="mt-14">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
                MCP quality score&nbsp;·&nbsp;maturity, not trust&nbsp;·&nbsp;
                <Link href="/methodology" className="hover:text-[var(--color-accent)]">
                  methodology
                </Link>
              </div>
              <div className="rule-t">
                {Object.entries(breakdown).map(([k, v]) => (
                  <div
                    key={k}
                    className="rule-b row-2up-end py-3 px-2"
                  >
                    <div className="font-mono text-[12px] text-[var(--color-cite)] capitalize">{k}</div>
                    <div className="text-right font-mono tabular-nums text-[14px] text-[var(--color-ink)]">
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Alternatives */}
            {alternatives.length > 0 && (
              <section className="mt-14">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
                  Alternatives in {CATEGORY_LABELS[server.category] ?? server.category}
                </div>
                <div className="rule-t">
                  {alternatives.map((a) => (
                    <Link
                      key={a.slug}
                      href={`/server/${a.slug}`}
                      className="block rule-b py-4 px-2 hover:bg-[var(--color-accent-soft)]/40 transition-colors group"
                    >
                      <div className="font-medium text-[15px] text-[var(--color-ink)] group-hover:text-[var(--color-accent)]">
                        {a.title}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--color-mute)]">
                        {a.name}
                      </div>
                      <p className="mt-1.5 text-[13px] text-[var(--color-cite)] line-clamp-2">
                        {a.description}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </main>

          {/* ───────────────── STICKY RIGHT RAIL ───────────────── */}
          <aside className="lg:sticky lg:top-20 space-y-9">
            {/* Install */}
            <div>
              <div className={RAIL_LABEL}>Install</div>
              {installs.length === 0 ? (
                <p className="text-[13px] text-[var(--color-mute)]">
                  No runnable package or remote endpoint in the registry. Check the repo for manual
                  install steps.
                </p>
              ) : (
                installs.map((inst, i) => (
                  <CopyField
                    key={i}
                    label={inst.label}
                    notes={inst.notes}
                    value={inst.command ?? inst.json ?? ''}
                  />
                ))
              )}
            </div>

            {/* Verdict API */}
            <div>
              <div className={RAIL_LABEL}>Verdict API</div>
              <CopyField value={`curl -s mcpindex.ai/api/v1/trust/server/${server.slug}`} />
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--color-mute)]">
                Free-tier verdict as JSON: decision + dimensions + severity. Call it from your agent
                before it invokes a tool it just discovered.
              </p>
            </div>

            {/* Details */}
            <div>
              <div className={RAIL_LABEL}>Details</div>
              <dl className="rule-t font-mono text-[12px]">
                <RailRow k="version" v={`v${server.version}`} />
                <RailRow
                  k="category"
                  v={CATEGORY_LABELS[server.category] ?? server.category}
                  href={`/best/${server.category}`}
                />
                {freshUntil && <RailRow k="verdict expires" v={freshUntil} />}
                <RailRow k="quality" v={`${score} / 100`} />
                {operator && <RailRow k="operator" v={operator} />}
              </dl>
            </div>

            {/* Provenance - the OTS / Bitcoin-anchored history signal (npm's
                provenance badge analog). Free tier returns the current verdict
                only; the anchored record lives on the authenticated tier. */}
            <div>
              <div className={RAIL_LABEL}>Provenance</div>
              <p className="text-[12px] leading-[1.55] text-[var(--color-cite)]">
                Verdict history is anchored to Bitcoin via OpenTimestamps. The free tier returns the
                current verdict only; the anchored record is served on the authenticated tier.
              </p>
            </div>

            {/* Links */}
            {(repoHref || siteHref || remoteHref) && (
              <div>
                <div className={RAIL_LABEL}>Links</div>
                <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.16em]">
                  {repoHref && (
                    <a href={repoHref} target="_blank" rel="noreferrer" className="text-[var(--color-cite)] hover:text-[var(--color-accent)]">
                      Repository →
                    </a>
                  )}
                  {siteHref && (
                    <a href={siteHref} target="_blank" rel="noreferrer" className="text-[var(--color-cite)] hover:text-[var(--color-accent)]">
                      Website →
                    </a>
                  )}
                  {remoteHref && (
                    <a href={remoteHref} target="_blank" rel="noreferrer" className="text-[var(--color-cite)] hover:text-[var(--color-accent)]">
                      Remote endpoint →
                    </a>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}

function RailRow({ k, v, href }: { k: string; v: string; href?: string }) {
  return (
    <div className="rule-b row-kv-auto py-2.5">
      <dt className="text-[var(--color-mute)] uppercase tracking-[0.12em] text-[10.5px]">{k}</dt>
      <dd className="text-right text-[var(--color-ink)] truncate">
        {href ? (
          <Link href={href} className="hover:text-[var(--color-accent)]">
            {v}
          </Link>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

// Decision -> visible chip styling. Light-palette only (per site palette).
// Keys match the AD-B contract directive values (UPPERCASE).
const DECISION_STYLE: Record<Decision, { label: string; chip: string; ring: string }> = {
  ALLOW: { label: 'ALLOW', chip: 'bg-emerald-50 text-emerald-900', ring: 'border-emerald-300' },
  DENY: { label: 'DENY', chip: 'bg-rose-50 text-rose-900', ring: 'border-rose-300' },
  REVIEW: { label: 'REVIEW', chip: 'bg-amber-50 text-amber-900', ring: 'border-amber-300' },
};

const SEVERITY_STYLE: Record<Severity, string> = {
  INFO: 'text-[var(--color-mute)]',
  LOW: 'text-[var(--color-cite)]',
  MEDIUM: 'text-amber-800',
  HIGH: 'text-orange-800',
  CRITICAL: 'text-rose-800',
};

const DIMENSION_VERDICT_LABEL: Record<DimensionVerdict, string> = {
  PASS: 'pass',
  FAIL: 'fail',
  UNVERIFIED: 'unverified',
  ERROR: 'error',
};

// Human labels for the honest_limits codes the verdict store carries. Unknown codes fall back to a
// humanized form (so a new limit never renders as a raw snake_case token, and is never hidden).
const LIMIT_LABEL: Record<string, string> = {
  semantic_only_no_conformance: 'Semantic screen only - the deterministic conformance probe has not run on this server',
  calibrated_false_v1: 'Confidence is reported but not yet calibrated (v1)',
  description_level_screen: 'Screen reads the tool description, not the live behavior',
  advisory_only: 'Advisory - the verdict never moves your agent on its own',
};
function limitLabel(code: string): string {
  return LIMIT_LABEL[code] ?? code.replace(/_/g, ' ');
}

// Human labels for the surfaced ChangeKind taxonomy (mirrors lib/changeKinds SURFACE_CHANGE_KINDS),
// so a non-expert reads "new required input" not "added-required-param". Raw token kept as title.
const KIND_LABEL: Record<string, string> = {
  'added-required-param': 'new required input',
  'added-optional-param': 'new optional input',
  'removed-param': 'input removed',
  'type-changed': 'input type changed',
  'enum-values-removed': 'allowed values removed',
  'constraint-narrowed': 'input constraint tightened',
  'required-set-expanded': 'more inputs now required',
  'output-schema-changed': 'output shape changed',
  'output-schema-added': 'output shape added',
  'annotation-flip-to-destructive': 'now marked destructive',
  'tool-removed': 'tool removed',
  'deep-schema-undiffable': 'schema too nested to diff',
};
function kindLabel(code: string): string {
  return KIND_LABEL[code] ?? code.replace(/-/g, ' ');
}

// Terse UTC date for the "screened" freshness line; flags a verdict older than 90 days as stale.
const STALE_DAYS = 90;
function screenedLabel(iso: string | undefined): { text: string; stale: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const ageDays = (Date.now() - t) / 86_400_000;
  return { text: new Date(t).toISOString().slice(0, 10), stale: ageDays > STALE_DAYS };
}

function TrustVerdictPanel({ state }: { state: VerdictState }) {
  // Fail-CLOSED rendering. Neither 'unverified' nor 'unavailable' may show
  // ALLOW or green. An un-evaluated tool is un-evaluated; the agent should
  // not infer trust.
  if (state.kind === 'unverified') {
    return (
      <div className="rule-t rule-b rule-l rule-r p-5 bg-white">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] px-2 py-1 bg-[var(--color-accent-soft)] text-[var(--color-cite)] border border-[var(--color-rule)]">
            NOT YET SCREENED
          </span>
          <span className="font-mono text-[11px] text-[var(--color-mute)]">
            no verdict on file
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-cite)]">
          Verdict not yet evaluated for this tool. The semantic screen takes
          adversarial cases first; coverage rolls out as the corpus expands ({D3_PROGRESS} labels
          to graduation). The deterministic conformance probe is built
          but has not yet run on the public corpus, so a recorded verdict here is
          REVIEW or UNVERIFIED, never a clearing ALLOW. Until a verdict is
          recorded, an agent should treat this tool as not-yet-cleared and fall
          back to its own checks. Method:{' '}
          <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            the eval, four-state verdict, honest limits
          </Link>
          .
        </p>
      </div>
    );
  }

  if (state.kind === 'unavailable') {
    return (
      <div className="rule-t rule-b rule-l rule-r p-5 bg-white">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] px-2 py-1 bg-amber-50 text-amber-900 border border-amber-300">
            VERDICT SERVICE UNAVAILABLE
          </span>
          <span className="font-mono text-[11px] text-[var(--color-mute)]">
            verdict API unreachable
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-cite)]">
          The trust verdict API did not respond. Treat this tool as not-cleared
          and fall back to your own checks until the verdict surface is reachable
          again. This is a transient failure, not a verdict.
        </p>
      </div>
    );
  }

  const verdict = state.verdict;

  // The deterministic schema-content FAIL is on a different axis from the semantic
  // screen, and the human `adjudication` is scoped to the SCREEN flag only. Insulate it:
  // a schema-content FAIL is held independently and is never visually cleared by a
  // `cleared` screen adjudication. Same split as the badge gate (one source of truth).
  const { schemaContentFail, screenFail } = splitFlags(verdict);

  // Defense-in-depth: the headline chip self-derives caution from the schema axis rather
  // than trusting the stored directive. A held schema FAIL can never sit under a green
  // ALLOW chip even if some other writer set ALLOW without the exporter's R7 floor (the
  // web emits no ALLOW today; this makes the page fail-closed independent of pipeline order).
  const effectiveDecision =
    schemaContentFail && verdict.directive.decision === 'ALLOW'
      ? 'REVIEW'
      : verdict.directive.decision;
  const style = DECISION_STYLE[effectiveDecision];
  const expires = new Date(verdict.directive.expires_at);
  const expiresLabel = Number.isNaN(expires.getTime())
    ? verdict.directive.expires_at
    : expires.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

  return (
    <div className={`rule-t rule-b rule-l rule-r p-5 bg-white border ${style.ring}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`font-mono text-[14px] uppercase tracking-[0.18em] px-2.5 py-1 ${style.chip} border ${style.ring}`}>
          {style.label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          status: {verdict.status}
        </span>
        <span className="font-mono text-[11px] text-[var(--color-mute)]">
          fresh until {expiresLabel}
        </span>
      </div>

      {(() => {
        const screened = screenedLabel(verdict.evaluated_at);
        const cells = [
          screened && `screened ${screened.text}${screened.stale ? ' (stale)' : ''}`,
          verdict.tier && `tier: ${verdict.tier}`,
          verdict.granularity && `granularity: ${verdict.granularity}`,
          verdict.origin && `source: ${verdict.origin}`,
        ].filter(Boolean) as string[];
        return cells.length ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
            {cells.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
        ) : null;
      })()}

      <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-ink)]">
        {verdict.directive.rationale}
      </p>

      {verdict.adjudication ? (
        <div className="mt-3 px-3 py-2 bg-[var(--color-accent-soft)] border border-[var(--color-rule)]">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)] mr-2">
            human review
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink)]">
            {verdict.adjudication.decision === 'cleared'
              ? 'cleared - screen flag was a false positive'
              : 'confirmed - screen flag upheld'}
          </span>
          {verdict.adjudication.reason && (
            <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--color-cite)]">
              {verdict.adjudication.reason}
            </p>
          )}
        </div>
      ) : (
        screenFail && (
          <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-300">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-800 mr-2">
              held for review
            </span>
            <span className="text-[12.5px] leading-[1.5] text-[var(--color-cite)]">
              The semantic screen raised a flag, but it has not been human-reviewed.
              It is held - not a confirmed finding - until a reviewer confirms or clears it.
            </span>
          </div>
        )
      )}

      {/* Deterministic schema-content FAIL: a SEPARATE axis, never cleared by the
          screen adjudication above (avoids the fail-open where a cleared screen flag
          would visually clear an unreviewed schema finding). */}
      {schemaContentFail && (
        <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-300">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-800 mr-2">
            schema flag - held
          </span>
          <span className="text-[12.5px] leading-[1.5] text-[var(--color-cite)]">
            A deterministic scan flagged a hostile marker in this tool&rsquo;s declared
            schema - the part the semantic screen does not read. It is held, not a
            confirmed accusation, pending review, and is not affected by any
            semantic-screen review above.
          </span>
        </div>
      )}

      {verdict.dimensions.length > 0 && (
        <div className="mt-4 rule-t">
          {verdict.dimensions.map((d) => (
            <div key={d.id} className="rule-b py-2.5 px-1">
              <div className="row-3up-tight">
                <code className="font-mono text-[12px] text-[var(--color-cite)] truncate">
                  {d.id}
                </code>
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-ink)]">
                  {DIMENSION_VERDICT_LABEL[d.verdict]}
                </span>
                <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${SEVERITY_STYLE[d.severity]}`}>
                  {d.severity}
                </span>
              </div>
              {d.evidence?.[0]?.quote && (
                <p className="mt-1.5 text-[12.5px] leading-[1.5] text-[var(--color-cite)]">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-mute)] mr-2">
                    evidence
                  </span>
                  &ldquo;{d.evidence[0].quote}&rdquo;
                  {d.evidence[0].method && (
                    <span className="ml-2 font-mono text-[10px] text-[var(--color-mute)]">
                      via {d.evidence[0].method}
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {verdict.honest_limits && verdict.honest_limits.length > 0 && (
        <div className="mt-4 rule-t pt-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)] mb-2">
            Limits of this verdict
          </div>
          <ul className="space-y-1">
            {verdict.honest_limits.map((l) => (
              <li key={l} className="text-[12.5px] leading-[1.5] text-[var(--color-cite)]">
                - {limitLabel(l)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 font-mono text-[10.5px] leading-[1.55] text-[var(--color-mute)]">
        Semantic screen: an LLM judge reads the tool description for hidden
        instructions (status PARTIAL). A pass means the description is not
        lying, not that the tool is safe: a high-capability tool with an honest
        description still warrants caution. The deterministic conformance probe
        has not been run on this server yet, so the screen here is semantic-only.
        Posture: advisory. Confidences are reported but not yet calibrated
        (calibrated=false at v1). History is paid-tier and not shown here.
      </p>
    </div>
  );
}

// Server-level contract-drift section. Joined from the public ledger by this server's fingerprint.
// null (ledger off/unavailable) renders nothing - never a false "clean". Tools stay anonymized.
function ContractDriftSection({ drift }: { drift: ServerDrift | null }) {
  if (!drift) return null;
  const generated = drift.ledgerGeneratedAt
    ? new Date(drift.ledgerGeneratedAt).toISOString().slice(0, 10)
    : null;
  const lastSeen = drift.lastSeen && !Number.isNaN(new Date(drift.lastSeen).getTime())
    ? new Date(drift.lastSeen).toUTCString()
    : null;
  return (
    <section className="mt-14">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        Contract drift&nbsp;·&nbsp;crawler-observed&nbsp;·&nbsp;
        <Link href="/ledger" className="hover:text-[var(--color-accent)]">
          ledger
        </Link>
      </div>
      <div className="rule-t rule-b rule-l rule-r p-5 bg-white">
        {drift.changes === 0 ? (
          <p className="text-[14px] leading-[1.6] text-[var(--color-cite)]">
            No contract changes observed for this server in the current crawl window
            {generated ? ` (as of ${generated})` : ''}. This reflects the public-registry crawl only,
            not a guarantee of stability.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-[14px] uppercase tracking-[0.18em] px-2.5 py-1 bg-[var(--color-accent-soft)] text-[var(--color-cite)] border border-[var(--color-rule)] tabular-nums">
                {drift.changes.toLocaleString()} contract change{drift.changes === 1 ? '' : 's'} observed
              </span>
              {lastSeen && (
                <span className="font-mono text-[11px] text-[var(--color-mute)]">most recent {lastSeen}</span>
              )}
              {drift.safetyRelevant && (
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[var(--color-cite)] text-[var(--color-cite)]">
                  safety-relevant diff
                </span>
              )}
            </div>
            {drift.kinds.length > 0 && (
              <div className="mt-3 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                  what changed
                </span>
                {drift.kinds.map((k) => (
                  <span
                    key={k}
                    title={k}
                    className="text-[11px] px-2 py-0.5 border border-[var(--color-rule)] text-[var(--color-cite)]"
                  >
                    {kindLabel(k)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        <p className="mt-4 font-mono text-[10.5px] leading-[1.55] text-[var(--color-mute)]">
          Observed by mcpindex&rsquo;s crawler between daily registry snapshots - a contract diff,
          not a safety verdict, and not an in-path prevention (that is the gate). A
          &ldquo;safety-relevant diff&rdquo; touches a safety-relevant field; it is not a confirmed
          vulnerability. Shown at the server level; individual tools stay anonymized. Absence is not
          a clean bill of health: only public-registry servers are crawled.
        </p>
      </div>
    </section>
  );
}
