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
  const style = DECISION_STYLE[verdict.directive.decision];
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
        verdict.dimensions.some((d) => d.verdict === 'FAIL') && (
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
                </p>
              )}
            </div>
          ))}
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
