import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServer, loadServers } from '@/lib/registry';
import { computeQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';
import { CATEGORY_LABELS } from '@/lib/categorize';

// Trust verdict shape (free-tier projection of the v1.0.0 verdict contract).
// History and Provenance are deliberately omitted: anonymous surfaces never
// return back-history (AD-B exposure tier; history is the un-backfillable
// moat). This is what /api/v1/verdict returns to an anonymous caller and what
// we render on the public detail page.
type Decision = 'allow' | 'deny' | 'review';
type Status = 'evaluated' | 'partial' | 'unevaluated' | 'stale' | 'error';
type DimensionVerdict = 'pass' | 'fail' | 'unverified' | 'error';
type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

type FreeTierVerdict = {
  schema_version: '1.0';
  directive: {
    decision: Decision;
    rationale: string;
    expires_at: string; // ISO-8601
  };
  status: Status;
  dimensions: ReadonlyArray<{
    id: string; // e.g. "mcpindex.integrity.description"
    verdict: DimensionVerdict;
    severity: Severity;
  }>;
};

// V1 advisory: per-tool verdicts are written by mcpindex-trust and surfaced
// here. The wiring (loader -> /api/v1/verdict -> mcpindex-trust store) is
// scheduled with the D3 corpus ramp. Today the page renders the empty state
// honestly. The shape below is what the loader will return when wired.
// TODO(v1-advisory): replace the static null with a call to the verdict
// loader once /api/v1/verdict?server={slug} ships. Source of truth:
// mcpindex-trust contract.py (Verdict.free_tier projection).
async function loadVerdictForServer(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  slug: string,
): Promise<FreeTierVerdict | null> {
  return null;
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
  const verdict = await loadVerdictForServer(server.slug);
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
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[--color-mute] hover:text-[--color-accent]"
        >
          ← Index
        </Link>

        <header className="mt-6 grid sm:grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <h1 className="t-page-h1 font-medium text-[--color-ink]">
              {server.title}
            </h1>
            <div className="mt-3 font-mono text-[12px] text-[--color-mute] flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{server.name}</span>
              <span className="text-[--color-rule]">·</span>
              <span>v{server.version}</span>
              <span className="text-[--color-rule]">·</span>
              <Link
                href={`/best/${server.category}`}
                className="text-[--color-cite] hover:text-[--color-accent]"
              >
                {CATEGORY_LABELS[server.category] ?? server.category}
              </Link>
            </div>
          </div>
          <QualityBadge score={score} />
        </header>

        <p className="mt-6 text-[17px] leading-[1.55] text-[--color-cite] max-w-[640px]">
          {server.description}
        </p>

        {/* Links */}
        <div className="mt-8 flex flex-wrap gap-3 font-mono text-[11px] uppercase tracking-[0.16em]">
          {repoHref && (
            <a
              href={repoHref}
              target="_blank"
              rel="noreferrer"
              className="border border-[--color-rule] px-3 py-1.5 text-[--color-cite] hover:border-[--color-accent] hover:text-[--color-accent]"
            >
              Repository →
            </a>
          )}
          {siteHref && (
            <a
              href={siteHref}
              target="_blank"
              rel="noreferrer"
              className="border border-[--color-rule] px-3 py-1.5 text-[--color-cite] hover:border-[--color-accent] hover:text-[--color-accent]"
            >
              Website →
            </a>
          )}
          {remoteHref && (
            <a
              href={remoteHref}
              target="_blank"
              rel="noreferrer"
              className="border border-[--color-rule] px-3 py-1.5 text-[--color-cite] hover:border-[--color-accent] hover:text-[--color-accent]"
            >
              Remote endpoint →
            </a>
          )}
        </div>

        {/* Trust verdict (v1 advisory). Free-tier projection only:
            directive + status + dimension verdicts + severity + expires_at.
            History is paid-tier and is NOT rendered here. */}
        <section className="mt-12">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
            §00&nbsp;&nbsp;Trust verdict&nbsp;·&nbsp;v1 advisory&nbsp;·&nbsp;{' '}
            <Link href="/methodology" className="hover:text-[--color-accent]">
              method
            </Link>
          </div>
          <TrustVerdictPanel verdict={verdict} />
        </section>

        {/* Install commands */}
        <section className="mt-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
            §01&nbsp;&nbsp;Install
          </div>
          {installs.length === 0 ? (
            <p className="text-[14px] text-[--color-mute]">
              No runnable package or remote endpoint listed in the registry. Check the repo for
              manual install instructions.
            </p>
          ) : (
            <div className="space-y-6">
              {installs.map((inst, i) => (
                <div key={i} className="rule-t pt-5">
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[--color-cite] mb-2">
                    {inst.label}
                  </div>
                  {inst.notes && (
                    <p className="text-[13px] text-[--color-mute] mb-3">{inst.notes}</p>
                  )}
                  {inst.command && (
                    <pre className="bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
                      <code>{inst.command}</code>
                    </pre>
                  )}
                  {inst.json && (
                    <pre className="bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
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
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
              §02&nbsp;&nbsp;Environment variables
            </div>
            <div className="rule-t">
              {server.envVars.map((v) => (
                <div
                  key={v.name}
                  className="rule-b grid sm:grid-cols-[200px_auto_1fr] gap-4 py-4 px-2"
                >
                  <code className="font-mono text-[13px] text-[--color-ink]">{v.name}</code>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[--color-mute] flex gap-2">
                    {v.isRequired && <span className="text-[--color-accent]">required</span>}
                    {v.isSecret && <span>secret</span>}
                  </div>
                  <p className="text-[13px] text-[--color-cite]">
                    {v.description ?? <span className="text-[--color-mute]">no description</span>}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Quality breakdown */}
        <section className="mt-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
            §03&nbsp;&nbsp;MCP Quality Score &nbsp;·&nbsp;{' '}
            <Link href="/methodology" className="hover:text-[--color-accent]">
              methodology
            </Link>
          </div>
          <div className="rule-t">
            {Object.entries(breakdown).map(([k, v]) => (
              <div
                key={k}
                className="rule-b grid grid-cols-[1fr_60px] gap-4 py-3 px-2 items-center"
              >
                <div className="font-mono text-[12px] text-[--color-cite] capitalize">{k}</div>
                <div className="text-right font-mono tabular-nums text-[14px] text-[--color-ink]">
                  {v}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Alternatives */}
        {alternatives.length > 0 && (
          <section className="mt-16">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
              §04&nbsp;&nbsp;Alternatives in {CATEGORY_LABELS[server.category] ?? server.category}
            </div>
            <div className="rule-t">
              {alternatives.map((a) => (
                <Link
                  key={a.slug}
                  href={`/server/${a.slug}`}
                  className="block rule-b py-4 px-2 hover:bg-[--color-accent-soft]/40 transition-colors group"
                >
                  <div className="font-medium text-[15px] text-[--color-ink] group-hover:text-[--color-accent]">
                    {a.title}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[--color-mute]">
                    {a.name}
                  </div>
                  <p className="mt-1.5 text-[13px] text-[--color-cite] line-clamp-2">
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
const DECISION_STYLE: Record<Decision, { label: string; chip: string; ring: string }> = {
  allow: {
    label: 'ALLOW',
    chip: 'bg-emerald-50 text-emerald-900',
    ring: 'border-emerald-300',
  },
  deny: {
    label: 'DENY',
    chip: 'bg-rose-50 text-rose-900',
    ring: 'border-rose-300',
  },
  review: {
    label: 'REVIEW',
    chip: 'bg-amber-50 text-amber-900',
    ring: 'border-amber-300',
  },
};

const SEVERITY_STYLE: Record<Severity, string> = {
  info: 'text-[--color-mute]',
  low: 'text-[--color-cite]',
  medium: 'text-amber-800',
  high: 'text-orange-800',
  critical: 'text-rose-800',
};

const DIMENSION_VERDICT_GLYPH: Record<DimensionVerdict, string> = {
  pass: 'pass',
  fail: 'fail',
  unverified: 'unverified',
  error: 'error',
};

function TrustVerdictPanel({ verdict }: { verdict: FreeTierVerdict | null }) {
  // Empty state: render honestly. No fake "ALLOW" defaults, no fake "REVIEW".
  // An un-evaluated tool is un-evaluated; the agent should not infer trust.
  if (!verdict) {
    return (
      <div className="rule-t rule-b rule-l rule-r p-5 bg-white">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] px-2 py-1 bg-[--color-accent-soft] text-[--color-cite] border border-[--color-rule]">
            UNEVALUATED
          </span>
          <span className="font-mono text-[11px] text-[--color-mute]">
            no verdict on file
          </span>
        </div>
        <p className="mt-3 text-[14px] leading-[1.6] text-[--color-cite] max-w-[640px]">
          Verdict not yet evaluated for this tool. The hybrid eval runs adversarial
          cases first; coverage rolls out as the corpus expands. Until a verdict
          is recorded, an agent should treat this tool as not-yet-cleared and
          fall back to its own checks. Method:{' '}
          <Link href="/methodology" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            hybrid eval, four-state verdict, honest limits
          </Link>
          .
        </p>
      </div>
    );
  }

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
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[--color-mute]">
          status: {verdict.status}
        </span>
        <span className="font-mono text-[11px] text-[--color-mute]">
          fresh until {expiresLabel}
        </span>
      </div>

      <p className="mt-3 text-[14.5px] leading-[1.55] text-[--color-ink] max-w-[640px]">
        {verdict.directive.rationale}
      </p>

      {verdict.dimensions.length > 0 && (
        <div className="mt-4 rule-t">
          {verdict.dimensions.map((d) => (
            <div
              key={d.id}
              className="rule-b grid grid-cols-[1fr_90px_90px] gap-3 py-2.5 px-1 items-baseline"
            >
              <code className="font-mono text-[12px] text-[--color-cite] truncate">
                {d.id}
              </code>
              <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[--color-ink]">
                {DIMENSION_VERDICT_GLYPH[d.verdict]}
              </span>
              <span className={`font-mono text-[11px] uppercase tracking-[0.14em] ${SEVERITY_STYLE[d.severity]}`}>
                {d.severity}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 font-mono text-[10.5px] leading-[1.55] text-[--color-mute] max-w-[640px]">
        Hybrid eval: deterministic conformance probe + LLM judge. Both legs
        execute and are recorded; conformance is monitored, not enforced.
        Posture: advisory. Confidences are reported but not yet calibrated
        (calibrated=false at v1). History is paid-tier and not shown here.
      </p>
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  return (
    <div className="rule-t rule-b rule-l rule-r p-4 bg-[--color-accent-soft] text-center w-[120px]">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[--color-mute]">
        Quality Score
      </div>
      <div className="mt-2 font-mono tabular-nums text-[36px] text-[--color-ink] leading-none">
        {score}
      </div>
      <div className="font-mono text-[10px] text-[--color-mute] mt-1">/100</div>
    </div>
  );
}
