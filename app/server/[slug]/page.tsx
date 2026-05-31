import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServer, loadServers } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';
import { CATEGORY_LABELS } from '@/lib/categorize';
import {
  getVerdict,
  type Verdict as FreeTierVerdict,
  type Decision,
  type Severity,
  type DimensionVerdict,
} from '@/lib/verdicts';

// Trust verdict shape (free-tier projection of the v1.0.0 verdict contract).
// UPPERCASE values match the canonical AD-B contract (docs/contract-schema.md
// in mcpindex-trust) and the wire shape returned by
// /api/v1/trust/{tool,server}/... in this repo. History and Provenance are
// deliberately omitted: anonymous surfaces never return back-history (AD-B
// exposure tier; history is the un-backfillable moat).
// Verdict shape + enum types (Decision/Severity/DimensionVerdict) are imported
// from '@/lib/verdicts' — one source of truth, shared with the /best directory.

// Three rendering states for the trust panel:
// - { kind: 'verdict', verdict }  -> render the populated FreeTierVerdict.
// - { kind: 'unverified' }        -> API reachable, no verdict yet (v1 default).
// - { kind: 'unavailable' }       -> verdict service unreachable / non-2xx.
//
// Both 'unverified' and 'unavailable' fail CLOSED: no ALLOW state, no green.
type VerdictState =
  | { kind: 'verdict'; verdict: FreeTierVerdict }
  | { kind: 'unverified' }
  | { kind: 'unavailable' };

// Server pages bypass HTTP: read the seeded verdict store directly via the
// shared lib (cached, case-normalized, fixtures excluded). The
// /api/v1/trust/server/[slug] endpoint stays live for direct API consumers
// (npm mcp-server-mcpindex + agent integrations).
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

  // JSON-LD for Google + agent crawlers
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

  // Belt-and-suspenders URL scheme check. normalize() already strips
  // non-http(s) URLs at registry load; this guards against future code paths
  // that bypass normalize.
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="mx-auto max-w-[920px] px-6 sm:px-10 pt-16 pb-24">
        <Link
          href="/leaderboard"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-mute)] hover:text-[var(--color-accent)]"
        >
          ← Index
        </Link>

        <header className="mt-6 grid sm:grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <h1 className="t-page-h1 font-medium text-[var(--color-ink)]">
              {server.title}
            </h1>
            <div className="mt-3 font-mono text-[12px] text-[var(--color-mute)] flex flex-wrap items-center gap-x-4 gap-y-1">
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
              <span className="text-[var(--color-rule)]">·</span>
              <span>Quality {score}/100</span>
            </div>
          </div>
          <HeaderVerdictBadge state={verdictState} />
        </header>

        <p className="mt-6 text-[17px] leading-[1.55] text-[var(--color-cite)] max-w-[640px]">
          {server.description}
        </p>

        {/* Links */}
        <div className="mt-8 flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-[0.16em]">
          {repoHref && (
            <a
              href={repoHref}
              target="_blank"
              rel="noreferrer"
              className="border border-[var(--color-rule)] px-3 py-1.5 text-[var(--color-cite)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Repository →
            </a>
          )}
          {siteHref && (
            <a
              href={siteHref}
              target="_blank"
              rel="noreferrer"
              className="border border-[var(--color-rule)] px-3 py-1.5 text-[var(--color-cite)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Website →
            </a>
          )}
          {remoteHref && (
            <a
              href={remoteHref}
              target="_blank"
              rel="noreferrer"
              className="border border-[var(--color-rule)] px-3 py-1.5 text-[var(--color-cite)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Remote endpoint →
            </a>
          )}
        </div>

        {/* Trust verdict (v1 advisory). Free-tier projection only:
            directive + status + dimension verdicts + severity + expires_at.
            History is paid-tier and is NOT rendered here. */}
        <section className="mt-12">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
            §00&nbsp;&nbsp;Trust verdict&nbsp;·&nbsp;v1 advisory&nbsp;·&nbsp;{' '}
            <Link href="/methodology" className="hover:text-[var(--color-accent)]">
              method
            </Link>
          </div>
          <TrustVerdictPanel state={verdictState} />
        </section>

        {/* Install commands */}
        <section className="mt-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
            §01&nbsp;&nbsp;Install
          </div>
          {installs.length === 0 ? (
            <p className="text-[14px] text-[var(--color-mute)]">
              No runnable package or remote endpoint listed in the registry. Check the repo for
              manual install instructions.
            </p>
          ) : (
            <div className="space-y-6">
              {installs.map((inst, i) => (
                <div key={i} className="rule-t pt-5">
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-cite)] mb-2">
                    {inst.label}
                  </div>
                  {inst.notes && (
                    <p className="text-[13px] text-[var(--color-mute)] mb-3">{inst.notes}</p>
                  )}
                  {inst.command && (
                    <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
                      <code>{inst.command}</code>
                    </pre>
                  )}
                  {inst.json && (
                    <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
                      <code>{inst.json}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Env vars */}
        {server.envVars.length > 0 && (
          <section className="mt-16">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
              §02&nbsp;&nbsp;Environment variables
            </div>
            <div className="rule-t">
              {server.envVars.map((v) => (
                <div
                  key={v.name}
                  className="rule-b grid sm:grid-cols-[200px_auto_1fr] gap-4 py-4 px-2"
                >
                  <code className="font-mono text-[13px] text-[var(--color-ink)]">{v.name}</code>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)] flex gap-2">
                    {v.isRequired && <span className="text-[var(--color-accent)]">required</span>}
                    {v.isSecret && <span>secret</span>}
                  </div>
                  <p className="text-[13px] text-[var(--color-cite)]">
                    {v.description ?? <span className="text-[var(--color-mute)]">no description</span>}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quality breakdown */}
        <section className="mt-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
            §03&nbsp;&nbsp;MCP Quality Score &nbsp;·&nbsp;{' '}
            <Link href="/methodology" className="hover:text-[var(--color-accent)]">
              methodology
            </Link>
          </div>
          <div className="rule-t">
            {Object.entries(breakdown).map(([k, v]) => (
              <div
                key={k}
                className="rule-b grid grid-cols-[1fr_60px] gap-4 py-3 px-2 items-center"
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
          <section className="mt-16">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
              §04&nbsp;&nbsp;Alternatives in {CATEGORY_LABELS[server.category] ?? server.category}
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
      </article>
    </>
  );
}

// Decision -> visible chip styling. Light-palette only (per site palette).
// Color encodes severity of the operational signal, not a brand mood.
// Keys match the AD-B contract directive values (UPPERCASE).
const DECISION_STYLE: Record<Decision, { label: string; chip: string; ring: string }> = {
  ALLOW: {
    label: 'ALLOW',
    chip: 'bg-emerald-50 text-emerald-900',
    ring: 'border-emerald-300',
  },
  DENY: {
    label: 'DENY',
    chip: 'bg-rose-50 text-rose-900',
    ring: 'border-rose-300',
  },
  REVIEW: {
    label: 'REVIEW',
    chip: 'bg-amber-50 text-amber-900',
    ring: 'border-amber-300',
  },
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
            UNVERIFIED
          </span>
          <span className="font-mono text-[11px] text-[var(--color-mute)]">
            no verdict on file
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-cite)] max-w-[640px]">
          Verdict not yet evaluated for this tool. The hybrid eval runs adversarial
          cases first; coverage rolls out as the corpus expands. Until a verdict
          is recorded, an agent should treat this tool as not-yet-cleared and
          fall back to its own checks. Method:{' '}
          <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            hybrid eval, four-state verdict, honest limits
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
        <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-cite)] max-w-[640px]">
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
        <span className={`font-mono text-[12px] uppercase tracking-[0.18em] px-2.5 py-1 ${style.chip} border ${style.ring}`}>
          {style.label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          status: {verdict.status}
        </span>
        <span className="font-mono text-[11px] text-[var(--color-mute)]">
          fresh until {expiresLabel}
        </span>
      </div>

      <p className="mt-3 text-[14.5px] leading-[1.55] text-[var(--color-ink)] max-w-[640px]">
        {verdict.directive.rationale}
      </p>

      {verdict.dimensions.length > 0 && (
        <div className="mt-4 rule-t">
          {verdict.dimensions.map((d) => (
            <div key={d.id} className="rule-b py-2.5 px-1">
              <div className="grid grid-cols-[1fr_90px_90px] gap-3 items-baseline">
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

      <p className="mt-4 font-mono text-[10.5px] leading-[1.55] text-[var(--color-mute)] max-w-[640px]">
        Semantic screen: an LLM judge reads the tool description for hidden
        instructions (status PARTIAL). A pass means the description is not
        lying, not that the tool is safe: a high-capability tool with an honest
        description still warrants caution. The deterministic conformance probe
        is in build, not yet run here. Posture: advisory. Confidences are
        reported but not yet calibrated (calibrated=false at v1). History is
        paid-tier and not shown here.
      </p>
    </div>
  );
}

// Header hero: the TRUST signal leads (site thesis = trust over quality/
// popularity). Quality is demoted to a small inline stat in the meta row; the
// full quality breakdown remains in section §03.
function HeaderVerdictBadge({ state }: { state: VerdictState }) {
  if (state.kind === 'verdict') {
    const style = DECISION_STYLE[state.verdict.directive.decision];
    const flagged = state.verdict.dimensions.some((d) => d.verdict === 'FAIL');
    return (
      <div className={`rule-t rule-b rule-l rule-r p-4 text-center w-[120px] border ${style.ring}`}>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          Trust
        </div>
        <div className={`mt-2 inline-block font-mono text-[14px] uppercase tracking-[0.14em] px-2 py-1 border ${style.chip} ${style.ring}`}>
          {style.label}
        </div>
        <div className="mt-2 font-mono text-[10px] text-[var(--color-mute)]">
          {state.verdict.status}
          {flagged ? ' · flagged' : ''}
        </div>
      </div>
    );
  }
  const label = state.kind === 'unavailable' ? 'unavailable' : 'unverified';
  return (
    <div className="rule-t rule-b rule-l rule-r p-4 text-center w-[120px]">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Trust
      </div>
      <div className="mt-2 inline-block font-mono text-[12px] uppercase tracking-[0.14em] px-2 py-1 bg-[var(--color-accent-soft)] text-[var(--color-cite)] border border-[var(--color-rule)]">
        {label}
      </div>
    </div>
  );
}
