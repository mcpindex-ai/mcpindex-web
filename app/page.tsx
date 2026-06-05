import Link from 'next/link';
import { LiveTicker } from '@/components/LiveTicker';
import { VerdictReveal } from '@/components/VerdictReveal';
import { CopyField } from '@/components/CopyField';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import DriftGateDemo from '@/components/DriftGateDemo';
import { GateLoop } from '@/components/home/GateLoop';
import { GateEdges } from '@/components/home/GateEdges';
import { Mark } from '@/components/Mark';
import { Seal } from '@/components/Seal';
import { getServerCount, getCategoryCount } from '@/lib/registry';
import { listScreened } from '@/lib/verdicts';

export const revalidate = 3600;

export default async function Home() {
  const [count, categories, screened] = await Promise.all([
    getServerCount(),
    getCategoryCount(),
    listScreened(),
  ]);

  // Real verdicts (never fabricated) for the cycling reveal in §the-network.
  // Varied set: a DENY, an ALLOW, a REVIEW where present, then fill to four.
  const DIM_LABEL: Record<string, string> = {
    'mcpindex.integrity.description': 'integrity',
    'mcpindex.conformance.schema': 'conformance',
  };
  const withRationale = screened.filter((s) => s.verdict.directive.rationale);
  const picks: typeof withRationale = [];
  for (const dec of ['DENY', 'ALLOW', 'REVIEW'] as const) {
    const m = withRationale.find(
      (s) => s.verdict.directive.decision === dec && !picks.includes(s),
    );
    if (m) picks.push(m);
  }
  for (const s of withRationale) {
    if (picks.length >= 4) break;
    if (!picks.includes(s)) picks.push(s);
  }
  const reveals = picks.map((s) => ({
    slug: s.slug,
    name: s.verdict.title ?? s.slug,
    decision: s.verdict.directive.decision,
    rationale: s.verdict.directive.rationale,
    dims: s.verdict.dimensions
      .slice(0, 2)
      .map((dm) => ({ label: DIM_LABEL[dm.id] ?? dm.id, verdict: dm.verdict })),
  }));

  // Primary entity signal for a 0->1 launch: Organization + WebSite +
  // SoftwareApplication. Claims stay (A)-launch-state and (B)-honest - the gate
  // is the product; no safety/graduation assertion lives here.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://mcpindex.ai/#org',
        name: 'mcpindex.ai',
        url: 'https://mcpindex.ai',
        description: 'The in-path trust gate for agent tool calls.',
        founder: { '@type': 'Person', name: 'Gautam Bharti' },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://mcpindex.ai/#website',
        url: 'https://mcpindex.ai',
        name: 'mcpindex.ai',
        publisher: { '@id': 'https://mcpindex.ai/#org' },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'mcpindex drift gate',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'macOS, Linux, Windows',
        description:
          'An in-path trust gate that pins every MCP tool contract and HOLDs a call the moment the contract silently changes, before your agent acts. A deterministic contract-diff, not a safety verdict.',
        url: 'https://mcpindex.ai',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@id': 'https://mcpindex.ai/#org' },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* §00 HERO — the gate: the silent-change pain, then the HOLD. */}
      <section className="rule-b bg-[var(--color-accent-soft)]">
        <div className="site-container pt-14 pb-16 sm:pt-20 sm:pb-24">
            <div className="hero-rise hero-rise-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-accent)] mb-6">
              In-path trust gate for agent tool calls
            </div>
            <h1 className="hero-rise hero-rise-2 font-medium text-[var(--color-ink)] leading-[1.06] tracking-[-0.02em] text-[clamp(2.2rem,1.2rem+3.4vw,3.4rem)]">
              The tool your agent trusted on Monday can change on Tuesday —{' '}
              <span className="italic font-normal">silently</span>.
              <br />
              <span className="font-semibold text-[var(--color-accent)]">
                mcpindex holds the call before your agent acts on the change.
              </span>
            </h1>
            <p className="hero-rise hero-rise-3 mt-6 text-[16px] sm:text-[17.5px] leading-[1.5] text-[var(--color-cite)]">
              It pins every MCP tool&rsquo;s contract on first sight and HOLDs the call the
              instant that contract drifts, before your agent acts on it. Zero credentials.
              One-click in Claude Desktop, Cursor, Cline, Zed.
            </p>

            {/* High-level trust-properties callout (not a single-test brag — the
                reproducible proof lives in the whitepaper §7). */}
            <div className="hero-rise hero-rise-3 mt-6 rule-t rule-b rule-l rule-r bg-white px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-1.5">
                In-path · deterministic · on your host
              </div>
              <p className="font-mono text-[12.5px] leading-[1.55] text-[var(--color-cite)]">
                The gate makes a deterministic contract-diff in the call path and HOLDs before
                your agent acts — no model in the loop, nothing leaves your machine. Open-source,
                so you can audit exactly what runs.
              </p>
            </div>

            <div className="hero-rise hero-rise-4 mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#install"
                className="font-mono text-[12.5px] uppercase tracking-[0.14em] text-white bg-[var(--color-accent)] px-6 py-3.5 hover:opacity-90 transition-opacity"
              >
                Install the gate →
              </a>
              <a
                href="#demo"
                className="font-mono text-[12.5px] uppercase tracking-[0.14em] text-[var(--color-ink)] border border-[var(--color-rule)] px-6 py-3.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
              >
                Watch it hold a drift →
              </a>
              <Link
                href="/methodology"
                className="font-mono text-[12px] text-[var(--color-mute)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] transition-colors"
              >
                Read the methodology →
              </Link>
              <Link
                href="/whitepaper"
                className="font-mono text-[12px] text-[var(--color-mute)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] transition-colors"
              >
                Read the whitepaper →
              </Link>
            </div>

            <div className="hero-rise hero-rise-4 mt-8 font-mono text-[12px] leading-[1.5] text-[var(--color-mute)]">
              Runs locally · works in Claude Desktop, Cursor, Cline, Zed · the default build
              egresses nothing
            </div>
            <div className="hero-rise hero-rise-4 mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <ProvenanceBadge />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-mute)]">
                Deterministic diff · contract-diff, not a safety verdict
              </span>
            </div>
        </div>
      </section>

      <LiveTicker />

      {/* §how-it-works — the gate loop, four concrete steps. */}
      <section id="how-it-works" className="rule-t scroll-mt-20">
        <div className="reveal site-container py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            How the gate works
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)]">
            Pin the contract. HOLD the change.
          </h2>
          <p className="mt-3 mb-8 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            Agents act on a tool&rsquo;s description the way they act on a system prompt. MCP
            tools are remote and updatable with no version bump. The description your agent
            trusted can change underneath it. The gate is the in-path check that catches that
            change before the call goes through.
          </p>
          <GateLoop />
        </div>
      </section>

      {/* §demo — the real deterministic gate, client-side. */}
      <section id="demo" className="rule-t scroll-mt-20">
        <div className="site-container py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            Watch it hold a drift
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)]">
            Pin a tool, apply a change, see the verdict.
          </h2>
          <p className="mt-3 mb-10 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            The same deterministic gate that runs in your agent: a contract-diff, not a safety
            verdict. Pick a drift. A breaking or dangerous change is HELD with the exact
            ChangeKind; a benign added-optional proceeds silently.
          </p>
          <DriftGateDemo />
        </div>
      </section>

      {/* §honest-edges — updated for the gate. */}
      <section className="rule-t">
        <div className="reveal site-container py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            Honest about the edges
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)]">
            What the gate claims — and what it doesn&apos;t.
          </h2>
          <p className="mt-3 mb-10 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            A trust product earns trust by stating its edges. The gate&rsquo;s verdict is
            &ldquo;this contract changed&rdquo;, never &ldquo;this is safe&rdquo;.{' '}
            <Link
              href="/methodology"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
            >
              Read the methodology
            </Link>
            .
          </p>
          <GateEdges />
        </div>
      </section>

      {/* Dark proof band — the trust posture, in context. */}
      <section className="rule-t bg-[var(--color-ink)]">
        <div className="reveal site-container py-20 sm:py-24">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-500 mb-3">
            Trust, stated plainly
          </div>
          <h2 className="t-h3 font-medium text-white">
            In-path, deterministic, and no custody of your credentials.
          </h2>
          <p className="mt-3 mb-8 text-[14.5px] leading-[1.55] text-zinc-400">
            The gate diffs a tool&rsquo;s live contract against what you pinned, fails closed to
            a HOLD on doubt, and never holds your keys. We state where it stops as plainly as
            what it catches.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/trust"
              className="font-mono text-[12.5px] uppercase tracking-[0.14em] text-white border border-zinc-700 px-5 py-3 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
            >
              Read the trust model →
            </Link>
            <Link
              href="/methodology"
              className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-400 hover:text-white transition-colors"
            >
              Methodology →
            </Link>
            <Link
              href="/status"
              className="font-mono text-[12px] uppercase tracking-[0.14em] text-zinc-400 hover:text-white transition-colors"
            >
              Status →
            </Link>
          </div>
        </div>
      </section>

      {/* §the-network — the directory, the corpus the gate queries. Below the
          dark trust band so the gate proof + install own the fold (R2-M2). */}
      <section className="rule-t">
        <div className="reveal site-container py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            The corpus the gate queries
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)]">
            One question, two moments.
          </h2>
          <p className="mt-3 mb-8 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            Different verdict, same question. Before you wire a tool, the public directory
            screens it and says REVIEW or UNVERIFIED &mdash; a prior on whether a tool does what
            it claims. While you use it, the gate says HELD or PROCEED in the call path. Today
            every screen verdict is semantic-only and advisory: a prior, not a guarantee, and
            never an ALLOW or DENY (those unlock with the behavioral corpus). The corpus feedback
            loop ships in Pro; today the gate runs fully standalone.
          </p>

          {reveals.length > 0 && (
            <div className=" mb-8">
              <VerdictReveal items={reveals} />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/leaderboard"
              className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-cite)] hover:text-[var(--color-accent)]"
            >
              Browse the rankings →
            </Link>
            <Link
              href="/screen"
              className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-cite)] hover:text-[var(--color-accent)]"
            >
              Screen a tool →
            </Link>
            <span className="font-mono text-[11.5px] text-[var(--color-mute)]">
              {screened.length} tools screened so far · advisory, semantic-only
            </span>
          </div>
        </div>
      </section>

      {/* §install + API */}
      <section id="install" className="rule-t scroll-mt-20">
        <div className="site-container py-20 sm:py-24">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3 flex items-center gap-2">
            <Mark size={13} />
            Install it now
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)]">
            One command installs the gate.
          </h2>
          <p className="mt-3 mb-10 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            The gate is what you install. It rides the MCP session your agent already opens, no
            key required. Prefer to read before you run? The auditable path is{' '}
            <code className="font-mono text-[13px] text-[var(--color-ink)]">uv tool install</code>{' '}
            plus a manual wire &mdash; both in the{' '}
            <Link
              href="/docs#install-the-gate"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
            >
              docs
            </Link>
            . The one command below is the convenience path.
          </p>
          <div className=" space-y-5">
            <div className="rule-t rule-b rule-l rule-r border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-2">
              <CopyField
                label="Install the gate: one command (Claude Desktop / Cursor / Cline / Zed)"
                value="curl -fsSL https://mcpindex.ai/install.sh | sh"
                notes="Wires the in-path gate into your host config: each MCP server launches behind the gate, which checks every tool's contract in-path and HOLDs on a silent change. Inspect it first with `curl -fsSL https://mcpindex.ai/install.sh | less` — it only rewrites your MCP host config; uninstall.sh restores it. Zero credentials change hands; the gate reuses the session you already authenticated. The auditable uv install, per-client manual wiring, and the SDK one-liner are in the docs."
              />
              <div className="flex items-start gap-3 px-4 pb-3 pt-1">
                <Seal size={34} ring="var(--color-rule)" bracket="var(--color-ink)" />
                <p className="text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
                  Pinned, in-path, zero custody. The gate ships as the{' '}
                  <code className="font-mono text-[12.5px] text-[var(--color-ink)]">mcpindex-preflight</code>{' '}
                  package (via uv); it reads only public tool contracts, never your tokens. Full
                  wiring &mdash; including the auditable{' '}
                  <code className="font-mono text-[12.5px] text-[var(--color-ink)]">uv tool install</code>{' '}
                  path &mdash; is in the{' '}
                  <Link
                    href="/docs#install-the-gate"
                    className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
                  >
                    docs
                  </Link>
                  .
                </p>
              </div>
            </div>
            <details className="text-[13px] leading-[1.55] text-[var(--color-mute)]">
              <summary className="cursor-pointer font-mono text-[11.5px] uppercase tracking-[0.12em] hover:text-[var(--color-ink)]">
                Also available: the directory client
              </summary>
              <div className="mt-3">
                <CopyField
                  label="The directory client: discovery + advisory trust lookups (published)"
                  value="npm install -g mcp-server-mcpindex"
                  notes="A separate, published MCP client for the directory: recommend, search, and check_tool_trust. This is the advisory network the gate queries, not the in-path gate itself."
                />
              </div>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}
