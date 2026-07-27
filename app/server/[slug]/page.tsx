import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getServer, loadServers, loadSnapshotMeta } from '@/lib/registry';
import { computeQuality, rankByQuality } from '@/lib/quality';
import { buildInstalls } from '@/lib/installs';
import { getSourceLiveness, livenessSentence } from '@/lib/sourceLiveness';
import { anchorClaim } from '@/lib/verdictAnchor';
import { CATEGORY_LABELS } from '@/lib/categorize';
import { D3_PROGRESS } from '@/lib/honest-limits';
import { CopyField } from '@/components/CopyField';
import {
  getVerdict,
  type Verdict as FreeTierVerdict,
  type Decision,
  type Severity,
  type DimensionVerdict,
  type PreviewBadge,
  type PreviewState,
} from '@/lib/verdicts';
import { splitFlags } from '@/lib/badge';
import { ContractDrift } from '@/components/ContractDrift';
import { GateInstallBridge } from '@/components/GateInstallBridge';
import { ServerVerdictCta } from '@/components/ServerVerdictCta';
import { jsonLdSafe } from '@/lib/jsonLd';
import { buildServerJsonLd, isEndpointShaped, isSafeHref } from '@/lib/serverJsonLd';
import { isGoneSlug, resolveServerRedirect } from '@/lib/serverRemovals';

// Trust verdict shape (public projection of the v1.0.0 verdict contract).
// Full back-history is not surfaced on this public page; the current verdict is what
// renders here. (Verdict records are NOT timestamp-anchored - see the Provenance rail.)
//
// Two rendering states for the trust panel, both FAIL-CLOSED (no ALLOW, no
// green unless a real EVALUATED verdict says so):
//   verdict     -> render the populated FreeTierVerdict
//   unverified  -> no real screening verdict on file (v1 default for ~all servers).
//                  Also covers a preview-only record: an owner-consented preview badge
//                  minted for a server the platform has NOT screened. Its screening axis
//                  is "not yet screened" (never a red ERROR); the owner preview badge is a
//                  SEPARATE, subordinate axis carried on `previewBadge` and rendered below.
// (Verdicts come from the build-time store, so there is no "service unreachable"
// state today; reintroduce one only if a live verdict service is ever wired in.)
type VerdictState =
  | { kind: 'verdict'; verdict: FreeTierVerdict }
  | { kind: 'unverified'; previewBadge?: PreviewBadge };

async function loadVerdictForServer(slug: string): Promise<VerdictState> {
  const verdict = await getVerdict(slug);
  if (!verdict) return { kind: 'unverified' };
  // A preview-only record has no real screening verdict (owner-preview badge on an
  // un-screened server). Route the SCREENING axis to the same honest "not yet screened"
  // branch used for an absent verdict - do NOT render the ERROR that status-coercion
  // produced - while still surfacing the owner preview badge on its own axis.
  if (verdict.unscreened) return { kind: 'unverified', previewBadge: verdict.preview_badge };
  return { kind: 'verdict', verdict };
}

export const revalidate = 3600;

// Prerender only the top servers by quality; the long tail is generated on-demand via ISR
// (dynamicParams defaults to true) and then cached like any prerendered page. Prerendering ALL
// ~11.6k pages made build time scale linearly with registry growth (+250 servers in one day) and
// pushed Vercel builds toward resource-exhaustion errors. 1,500 covers what the leaderboard /
// best-of / search funnels actually link to; a tail page costs one on-demand render on first visit.
const PRERENDER_TOP_N = 1500;

export async function generateStaticParams() {
  const servers = await loadServers();
  return rankByQuality(servers)
    .slice(0, PRERENDER_TOP_N)
    .map(({ server }) => ({ slug: server.slug }));
}

export async function generateMetadata(
  ctx: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await ctx.params;
  const server = await getServer(slug);
  if (!server) {
    if (isGoneSlug(slug)) {
      return { title: 'Gone', robots: { index: false, follow: false } };
    }
    return { title: 'Server not found', robots: { index: false, follow: false } };
  }
  const deprecated = server.status === 'deprecated';
  // Every registry-mirroring directory renders this same blurb, so our search snippet was
  // byte-identical to five competitors' and earned a 0.24% CTR at positions 6-12. When the
  // liveness sweep has flagged the source, lead with that instead: it is the one fact on
  // the SERP that only we hold, and it is what the searcher is actually checking for.
  // Only the negative case is rewritten - absent liveness data is not an all-clear, so
  // there is nothing to say for it.
  // The "may be private or moved" hedge is not optional politeness: lib/sourceLiveness
  // publishes the OBSERVATION (a 404 from two vantages) and never the inference, because
  // a 404 cannot tell a deleted repo from a deliberately private one. The snippet is the
  // highest-visibility place that sentence appears and often the only place someone reads
  // it, so it carries the caveat too - shortened to survive Google's ~155-char truncation.
  const liveness = await getSourceLiveness(server.name);
  const description = liveness
    ? `Source repo returns HTTP ${liveness.evidence.http_status} (may be private or moved). ${server.description}`
    : server.description;
  return {
    // ~half of registry servers have title === name; emitting "X - X" duplicated the
    // slug in the <title>. Collapse to a single value when they match (the parent
    // template still appends "· mcpindex.ai").
    title: server.title === server.name ? server.name : `${server.title} - ${server.name}`,
    description,
    // Deprecated subjects stay addressable (no soft-404) but leave the index so
    // they do not compete with active listings after the registry retires them.
    ...(deprecated ? { robots: { index: false, follow: true } } : {}),
    alternates: { canonical: `https://mcpindex.ai/server/${server.slug}` },
    openGraph: {
      title: server.title,
      // Same `description` as the meta tag, not the raw blurb: a shared card is frequently
      // the only place the liveness caveat would ever be read.
      description,
      url: `https://mcpindex.ai/server/${server.slug}`,
      type: 'website',
      images: [`/server/${server.slug}/og`],
    },
    twitter: {
      card: 'summary_large_image',
      title: server.title,
      description,
      images: [`/server/${server.slug}/og`],
    },
  };
}

export default async function ServerPage(
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const server = await getServer(slug);
  if (!server) {
    const active = new Set((await loadServers()).map((s) => s.slug));
    const dest = resolveServerRedirect(slug, active);
    if (dest) permanentRedirect(`/server/${dest}`);
    // Gone slugs are answered 410 in proxy.ts; this is the RSC fallback.
    notFound();
  }

  const all = await loadServers();
  const { score, breakdown } = computeQuality(server);
  const installs = buildInstalls(server);
  // Absent => nothing publishable, NOT 'verified healthy'.
  const liveness = await getSourceLiveness(server.name);
  const verdictState = await loadVerdictForServer(server.slug);
  // Crawl-date framing for the post-verdict CTA; memoized snapshot, no extra fetch.
  const snapshotDay = (await loadSnapshotMeta()).fetchedAt?.slice(0, 10) ?? '';
  const alternatives = all
    .filter((s) => s.category === server.category && s.slug !== server.slug)
    .slice(0, 3);

  const jsonLd = buildServerJsonLd(server);

  const repoHref = isSafeHref(server.repositoryUrl) ? server.repositoryUrl : undefined;
  const remoteHref = isSafeHref(server.remoteUrl) ? server.remoteUrl : undefined;
  // Some registry entries put their MCP endpoint in the website field. An MCP
  // endpoint is an API URL, not a web page - a browser GET 4xxes even on live
  // servers (the same reason remoteHref below is copy-only, never an <a>), and
  // hyperlinking it reads as a broken outlink to every crawler. Endpoint-shaped
  // website URLs are therefore never rendered as links.
  const siteHrefRaw = isSafeHref(server.websiteUrl) ? server.websiteUrl : undefined;
  const siteHref =
    siteHrefRaw && !isEndpointShaped(siteHrefRaw, remoteHref) ? siteHrefRaw : undefined;

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

  // Owner preview badge lives on its own axis, independent of screening: it may ride a
  // fully screened verdict OR a preview-only record whose screening axis is "not yet screened".
  const previewBadge =
    verdictState.kind === 'verdict'
      ? verdictState.verdict.preview_badge
      : verdictState.previewBadge;

  const RAIL_LABEL =
    'font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-3';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />
      <div className="site-container pt-12 pb-24">
        <Link
          href="/leaderboard"
          className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)]"
        >
          ← Index
        </Link>

        <div className="mt-6 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-10 lg:gap-16 items-start">
          {/* ───────────────── MAIN COLUMN ───────────────── */}
          <main className="min-w-0">
            <h1 className="t-page-h1 font-medium text-[var(--color-ink)]">{server.title}</h1>
            <div className="mt-3 font-mono text-[12px] text-[var(--color-mute)] flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{server.name}</span>
              <span aria-hidden="true" className="inline-block w-px h-3 bg-[var(--color-rule)]" />
              <span>v{server.version}</span>
              <span aria-hidden="true" className="inline-block w-px h-3 bg-[var(--color-rule)]" />
              <Link
                href={`/best/${server.category}`}
                className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
              >
                {CATEGORY_LABELS[server.category] ?? server.category}
              </Link>
              {server.status === 'deprecated' ? (
                <>
                  <span aria-hidden="true" className="inline-block w-px h-3 bg-[var(--color-rule)]" />
                  <span className="text-[var(--color-ink)]">deprecated</span>
                </>
              ) : null}
            </div>

            {server.status === 'deprecated' ? (
              <p
                role="status"
                className="mt-6 border border-[var(--color-rule)] bg-[var(--color-accent-soft)]/40 px-4 py-3 text-[14px] leading-[1.5] text-[var(--color-cite)]"
              >
                This server is marked deprecated in the official MCP registry. The
                listing stays available for historical reference and is not offered
                in browse, sitemap, or leaderboard surfaces.
              </p>
            ) : null}

            {/* The liveness flag also renders in the right rail with full evidence, but a
                searcher who arrived asking "is this dead" should not have to scroll past
                install, badge and API sections to find the answer. Observation only - the
                wording stays in lib/sourceLiveness so it cannot drift into an accusation. */}
            {liveness ? (
              <p
                role="status"
                className="mt-6 border border-[var(--color-rule)] bg-[var(--color-accent-soft)]/40 px-4 py-3 text-[14px] leading-[1.5] text-[var(--color-cite)]"
              >
                {livenessSentence(liveness)}{' '}
                <a href="#source" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
                  Evidence
                </a>
                .
              </p>
            ) : null}

            {/* Admitted listings are not in the official registry. Saying so is both honest
                and useful - "nobody published this upstream" is information a reader wants. */}
            {server.source === 'admitted' ? (
              <p className="mt-6 border border-[var(--color-rule)] px-4 py-3 text-[14px] leading-[1.5] text-[var(--color-cite)]">
                Not listed in the official MCP registry. mcpindex indexes it anyway:{' '}
                {server.admittedReason}
              </p>
            ) : null}

            <p className="mt-6 text-[17px] leading-[1.55] text-[var(--color-cite)]">
              {server.description}
            </p>

            {/* Directory → gate: ~90% of Analytics landings are /server/* exits. */}
            <GateInstallBridge serverTitle={server.title} />

            {/* Verdict = the hero metric (npm puts downloads here; we put trust). */}
            <section className="mt-10">
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
                Trust verdict&nbsp;·&nbsp;v1 advisory&nbsp;·&nbsp;
                <Link href="/methodology" className="hover:text-[var(--color-accent-strong)]">
                  method
                </Link>
              </div>
              <TrustVerdictPanel state={verdictState} />
              <p className="mt-3 font-mono text-[11px] text-[var(--color-mute)]">
                Own this server?{' '}
                <Link href="/screen" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
                  Screen its description →
                </Link>
                {/* The "claim / verify ownership" funnel lives once, in the Listing
                    block of the right rail - the natural "is this your server?" spot,
                    next to the provenance disclosure. Not duplicated here. */}
              </p>
            </section>

            {/* Owner preview badge - an owner-consented, human-confirmed observation. Distinct
                from and subordinate to the screening verdict above; NEVER a security clearance.
                Independent of the screening axis: it renders whether the server is screened
                (verdict branch) or preview-only / not-yet-screened (unverified branch). */}
            {previewBadge && <OwnerPreviewPanel badge={previewBadge} />}

            <ServerVerdictCta serverTitle={server.title} snapshotDay={snapshotDay} />

            <ContractDrift serverId={server.name} />

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
                        {v.isRequired && <span className="text-[var(--color-accent-strong)]">required</span>}
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
                <Link href="/methodology" className="hover:text-[var(--color-accent-strong)]">
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
                      <div className="font-medium text-[15px] text-[var(--color-ink)] group-hover:text-[var(--color-accent-strong)]">
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
            {/* Install this MCP server (not the gate - see GateInstallBridge). */}
            <div>
              <div className={RAIL_LABEL}>Install this server</div>
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

            {/* Listing disclosure + the SINGLE claim funnel - these pages are
                scraped from the public registry, not self-submitted; say so, and
                route the maintainer to the real recourse. The self-serve /claim
                flow proves control of an HTTP remote's origin, so "Verify it" is
                offered only for a remote-having server; a package/stdio-only server
                cannot self-verify and gets the email recourse alone. The mailto
                stays as a fallback for maintainers who can't do the technical flow.
                Slugs are safe registry tokens; encodeURIComponent is defense-in-depth. */}
            <div>
              <div className={RAIL_LABEL}>Listing</div>
              <p className="text-[12px] leading-[1.55] text-[var(--color-cite)]">
                {/* Derive the provenance sentence from `source` rather than asserting one.
                    This line was unconditional, so every admitted page claimed registry
                    listing here while the banner above it said the opposite - the same page
                    contradicting itself on the one fact this product sells. */}
                {server.source === 'admitted'
                  ? 'Indexed by mcpindex; not listed in the official MCP registry.'
                  : 'Listed from the official MCP registry.'}{' '}
                {previewBadge ? (
                  'Maintainer-attested (preview).'
                ) : (
                  <>
                    Unclaimed by its maintainer.{' '}
                    {remoteHref ? (
                      <>
                        Maintainer?{' '}
                        <Link
                          href={`/claim?server=${encodeURIComponent(server.slug)}`}
                          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                        >
                          Verify it →
                        </Link>{' '}
                        ·{' '}
                        <a
                          href={`mailto:hello@mcpindex.ai?subject=${encodeURIComponent(`Claim listing: ${server.slug}`)}`}
                          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                        >
                          or email us →
                        </a>
                      </>
                    ) : (
                      <a
                        href={`mailto:hello@mcpindex.ai?subject=${encodeURIComponent(`Claim listing: ${server.slug}`)}`}
                        className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                      >
                        Maintainer? Email us →
                      </a>
                    )}
                  </>
                )}
              </p>
            </div>

            {/* This asserted "Verdict history is anchored to Bitcoin via OpenTimestamps",
                unconditionally, on every server page, while NOTHING anchored the published
                verdicts - the only anchor that existed was a real OTS proof over the empty
                set, and `ots upgrade` had never run, so even that sat pending for five weeks.

                The sentence is now DERIVED from data/verdict-anchors.json rather than
                written here. That is the actual fix: hand-written copy is what let nine
                surfaces drift from the evidence, and correcting them by hand would have left
                the same failure mode in place for the next drift. */}
            <div>
              <div className={RAIL_LABEL}>Provenance</div>
              <p className="text-[12px] leading-[1.55] text-[var(--color-cite)]">
                Each verdict is bound to a hash of the exact description it judged, so a
                re-crawl that changes the text produces a new record rather than silently
                inheriting this one. {anchorClaim()}{' '}
                <Link
                  href="/trust#anchor"
                  className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                >
                  Verify it yourself
                </Link>
                .
              </p>
            </div>

            {/* Links: registry-supplied third-party URLs, so nofollow - many
                targets go dead and we can't vouch for any of them. */}
            {(repoHref || siteHref || liveness) && (
              <div id="source" className="scroll-mt-8">
                <div className={RAIL_LABEL}>Links</div>
                <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.16em]">
                  {/* A confirmed-unreachable repo replaces the link rather
                      than sitting next to it: offering a link we know 404s
                      is the bug PR #15 fixed. Two vantages agreed before
                      anything renders here (lib/sourceLiveness coercion). */}
                  {liveness ? (
                    <div className="font-sans text-[12px] leading-[1.55] tracking-normal normal-case text-[var(--color-mute)]">
                      {livenessSentence(liveness)}
                      {liveness.confirmed_unavailable && (
                        <> Confirmed {liveness.confirmed_unavailable}.</>
                      )}{' '}
                      <Link
                        href="/research/source-liveness"
                        className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                      >
                        How we check →
                      </Link>{' '}
                      ·{' '}
                      <a
                        href={`mailto:hello@mcpindex.ai?subject=${encodeURIComponent(`Dispute source-liveness flag: ${server.slug}`)}`}
                        className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
                      >
                        Maintainer? Dispute this →
                      </a>
                    </div>
                  ) : (
                    repoHref && (
                      <a href={repoHref} target="_blank" rel="nofollow noreferrer" className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]">
                        Repository →
                      </a>
                    )
                  )}
                  {siteHref && (
                    <a href={siteHref} target="_blank" rel="nofollow noreferrer" className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]">
                      Website →
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Remote endpoint is an MCP API URL, not a web page - a browser
                GET 4xxes even on live servers, so it's copy-only, never an <a>. */}
            {remoteHref && (
              <div>
                <div className={RAIL_LABEL}>Remote endpoint</div>
                <CopyField value={remoteHref} />
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
          <Link href={href} className="hover:text-[var(--color-accent-strong)]">
            {v}
          </Link>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

// Owner-preview state -> a short, honest human label. The full honest sentence is the badge's
// own `statement` (rendered verbatim, escaped, below the label); this is only the chip caption.
const PREVIEW_STATE_LABEL: Record<PreviewState, string> = {
  clean: 'no contract drift observed',
  drift: 'contract drift observed',
  inconclusive: 'inconclusive',
};

// Owner preview panel: an owner-consented, human-confirmed OBSERVATION - never a security or
// safety clearance. Every field is owner-controlled, so it renders as escaped React text (no
// dangerouslySetInnerHTML). Visually subordinate to the platform's screening verdict above.
function OwnerPreviewPanel({ badge }: { badge: PreviewBadge }) {
  return (
    <section className="mt-10">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        Owner preview&nbsp;·&nbsp;not a verdict
      </div>
      <div className="rule-t rule-b rule-l rule-r p-5 bg-[var(--color-accent-soft)]/30 border border-[var(--color-rule)]">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] px-2 py-1 bg-white text-[var(--color-cite)] border border-[var(--color-rule)]">
            PREVIEW
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
            {PREVIEW_STATE_LABEL[badge.state]}
          </span>
          {badge.date && (
            <span className="font-mono text-[11px] text-[var(--color-mute)]">
              as of {badge.date}
            </span>
          )}
        </div>
        {badge.statement && (
          <p className="mt-3 text-[14px] leading-[1.6] text-[var(--color-ink)]">
            {badge.statement}
          </p>
        )}
        <p className="mt-3 font-mono text-[10.5px] leading-[1.55] text-[var(--color-mute)]">
          Preview - not a security or safety guarantee. Published at the owner&rsquo;s request and
          human-confirmed; it reports an observation, not a clearance, and is separate from and
          subordinate to the screening verdict above.
          {badge.confirmed_by ? <> Confirmed by {badge.confirmed_by}.</> : null}
        </p>
      </div>
    </section>
  );
}

// Decision -> visible chip styling. Light-palette only (per site palette).
// Keys match the AD-B contract directive values (UPPERCASE).
const DECISION_STYLE: Record<Decision, { label: string; chip: string; ring: string }> = {
  // ALLOW/DENY are contract states but not produced by the v1 screen - stone, not clearance chrome.
  ALLOW: { label: 'ALLOW*', chip: 'bg-stone-50 text-stone-700', ring: 'border-stone-300' },
  DENY: { label: 'DENY*', chip: 'bg-stone-50 text-stone-700', ring: 'border-stone-300' },
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
  // Fail-CLOSED rendering. 'unverified' may never show ALLOW or green. An
  // un-evaluated tool is un-evaluated; the agent should not infer trust.
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
          <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            the eval, four-state verdict, honest limits
          </Link>
          .
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
        (calibrated=false at v1). Full verdict history is not shown on this page.
      </p>
    </div>
  );
}
