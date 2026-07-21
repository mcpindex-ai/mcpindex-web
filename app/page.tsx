import Link from 'next/link';
import { jsonLdSafe } from '@/lib/jsonLd';
import { LiveTicker } from '@/components/LiveTicker';
import { VerdictReveal } from '@/components/VerdictReveal';
import { CopyField } from '@/components/CopyField';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import DriftGateDemo from '@/components/DriftGateDemo';
import { InstallCtaButton } from '@/components/InstallCtaButton';
import { INSTALL_SHELL_COMMAND } from '@/lib/install-command';
import {
  DISCOVERY_CLAUDE_MCP_ADD,
  DISCOVERY_GEMINI_MCP_ADD,
  DISCOVERY_NPM_GLOBAL,
  GATE_HOSTS_SHORT,
} from '@/lib/client-install';
import { GateLoop, GATE_LOOP_STEPS } from '@/components/home/GateLoop';
import { GateEdges } from '@/components/home/GateEdges';
import { Disclose } from '@/components/Disclose';
import { Mark } from '@/components/Mark';
import { Seal } from '@/components/Seal';
import { PriorityGuides } from '@/components/PriorityGuides';
import { listScreened } from '@/lib/verdicts';
import type { Metadata } from 'next';

export const revalidate = 3600;

// Homepage-specific OG/twitter (moved out of the root layout so it no longer leaks
// onto every subpage). Canonical stays the root domain (set in the root layout).
export const metadata: Metadata = {
  openGraph: {
    title: 'mcpindex - the in-path trust gate for agent tool calls',
    description:
      'The tool your agent trusted on Monday can change on Tuesday - silently. mcpindex holds the call before your agent acts on the change.',
    url: 'https://mcpindex.ai',
    siteName: 'mcpindex.ai',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@mcpindex',
    title: 'mcpindex - the in-path trust gate for agent tool calls',
    description:
      'The tool your agent trusted on Monday can change on Tuesday - silently. mcpindex holds the call before your agent acts on the change.',
  },
};

export default async function Home() {
  const screened = await listScreened();

  // Prefer REVIEW for the public homepage (v1 screen emits REVIEW/UNVERIFIED;
  // ALLOW/DENY are reserved). Fill with other decisions only if needed.
  const DIM_LABEL: Record<string, string> = {
    'mcpindex.integrity.description': 'integrity',
    'mcpindex.conformance.schema': 'conformance',
  };
  const withRationale = screened.filter((s) => s.verdict.directive.rationale);
  const picks: typeof withRationale = [];
  for (const s of withRationale) {
    if (picks.length >= 4) break;
    if (s.verdict.directive.decision === 'REVIEW') picks.push(s);
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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://mcpindex.ai/#org',
        name: 'mcpindex.ai',
        url: 'https://mcpindex.ai',
        description: 'The in-path trust gate for agent tool calls.',
      },
      {
        '@type': 'WebSite',
        '@id': 'https://mcpindex.ai/#website',
        url: 'https://mcpindex.ai',
        name: 'mcpindex.ai',
        publisher: { '@id': 'https://mcpindex.ai/#org' },
      },
      {
        // The gate is free, source-available software distributed as a package. Typed as
        // SoftwareSourceCode (not SoftwareApplication) so it stays out of Google's app
        // rich-result program, which requires a user rating we cannot honestly supply.
        // codeRepository/isAccessibleForFree carry the "free, installable" signal to LLMs.
        '@type': 'SoftwareSourceCode',
        name: 'mcpindex drift gate',
        description:
          'An in-path trust gate that pins every MCP tool contract and HOLDs a call the moment the contract silently changes, and grades the blast radius of every call (read, write, delete, send; reversible or not) before your agent acts. Deterministic and advisory - a contract-diff and a blast-radius label, not a safety verdict.',
        url: 'https://mcpindex.ai',
        codeRepository: 'https://github.com/mcpindex-ai/mcpindex-web',
        runtimePlatform: 'Node.js',
        isAccessibleForFree: true,
        author: { '@id': 'https://mcpindex.ai/#org' },
      },
      {
        '@type': 'HowTo',
        '@id': 'https://mcpindex.ai/#how-the-gate-works',
        name: 'How the mcpindex gate works',
        description:
          'Pin each MCP tool contract on first sight and HOLD the call when the contract silently changes-before your agent acts.',
        step: GATE_LOOP_STEPS.map((s, i) => ({
          '@type': 'HowToStep',
          position: i + 1,
          name: s.title,
          text: s.detail ? `${s.body} ${s.detail}` : s.body,
        })),
      },
      {
        '@type': 'FAQPage',
        '@id': 'https://mcpindex.ai/#faq',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'What happens when an MCP tool contract silently changes?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: `mcpindex pins every MCP tool contract on first sight and HOLDs the call the instant that contract drifts-before your agent acts. Zero credentials. One-click gate install in ${GATE_HOSTS_SHORT}.`,
            },
          },
          {
            '@type': 'Question',
            name: 'Does the gate hold my credentials?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'No. The gate is in-path, deterministic, and holds no custody of your credentials. It diffs a tool’s live contract against what you pinned and fails closed to a HOLD on doubt.',
            },
          },
          {
            '@type': 'Question',
            name: 'What is the blast-radius grade?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The gate labels each call’s blast radius in the path before it runs-action (read, write, delete, send, execute), what it touches, whether it can be undone, and whether it leaves your org. The grade is deterministic and advisory; it never overrides the gate’s HOLD/PROCEED decision.',
            },
          },
          {
            '@type': 'Question',
            name: 'What does the gate claim - and what doesn’t it?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'The gate says “this contract changed,” never “this is safe.” The blast-radius grade is advisory, not a safety call. The grade is static-what a call would do, read from its contract.',
            },
          },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }}
      />

      {/* §00 HERO - install in-fold (no scroll tax). */}
      <section className="rule-b bg-[var(--color-accent-soft)]">
        <div className="site-container pt-14 pb-16 sm:pt-20 sm:pb-24">
          <div className="hero-rise hero-rise-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-accent-strong)] mb-6">
            In-path trust gate for agent tool calls
          </div>
          <h1 className="hero-rise hero-rise-2 font-medium text-[var(--color-ink)] leading-[1.06] tracking-[-0.02em] text-[clamp(2.2rem,1.2rem+3.4vw,3.4rem)]">
            The tool your agent trusted on Monday can change on Tuesday -{' '}
            <span className="italic font-normal">silently</span>.
            <br />
            <span className="font-semibold text-[var(--color-accent-strong)]">
              mcpindex holds the call before your agent acts on the change.
            </span>
          </h1>
          <p className="hero-rise hero-rise-3 mt-6 text-[16px] sm:text-[17.5px] leading-[1.5] text-[var(--color-cite)]">
            It <strong>pins every MCP tool contract</strong> on first sight and{' '}
            <strong>HOLDs the call</strong> the instant that contract drifts-before your
            agent acts. Zero credentials. One-click gate install in {GATE_HOSTS_SHORT}.
          </p>

          <div className="hero-rise hero-rise-3 mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <ProvenanceBadge />
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-mute)]">
              Deterministic contract-diff · fails closed · not a safety verdict
            </span>
          </div>

          <div className="hero-rise hero-rise-4 mt-8 flex flex-wrap items-center gap-3">
            <InstallCtaButton />
            <a
              href="#demo"
              className="font-mono text-[12.5px] uppercase tracking-[0.14em] text-[var(--color-ink)] border border-[var(--color-rule)] px-6 py-3.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
            >
              Watch it hold a drift →
            </a>
          </div>

          <div id="install" className="hero-rise hero-rise-4 mt-8 scroll-mt-20">
            <div className="rule-t rule-b rule-l rule-r border-[var(--color-accent)] bg-white p-2">
              <CopyField
                label="Install the mcpindex gate (one command)"
                value={INSTALL_SHELL_COMMAND}
                trackSource="homepage_hero"
                notes="No pipe-to-shell: installs the PyPI package, then runs the wiring wizard. Script alternative: curl -fsSL https://mcpindex.ai/install.sh | sh (read it first with | less). Restarts your host after wiring."
              />
            </div>
            <p className="mt-3 font-mono text-[12px] leading-[1.5] text-[var(--color-mute)]">
              Free · no account · runs locally. This is the{' '}
              <strong className="text-[var(--color-cite)]">gate</strong> (in-path
              HOLD) - PyPI <code className="text-[var(--color-ink)]">mcpindex-gate</code>, not
              the directory MCP client.{' '}
              <Link
                href="/guides/install-the-gate-first-hold"
                className="underline decoration-[var(--color-accent-strong)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                New here? Walk through it →
              </Link>
              {' · '}
              <Link
                href="#install-paths"
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                Discovery one-liners ↓
              </Link>
              {' · '}
              <Link
                href="/docs#install-the-gate"
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                auditable uv path
              </Link>
              {' · '}
              <Link
                href="/install"
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                all install options →
              </Link>
            </p>
          </div>
        </div>
      </section>

      <LiveTicker />

      {/* §demo - product proof immediately after hero install. */}
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
            verdict. Breaking changes are HELD; benign added-optional proceeds silently.
          </p>
          <DriftGateDemo />
          <p className="mt-10 font-mono text-[12px] text-[var(--color-mute)]">
            Persona walkthrough &amp; embed:{' '}
            <Link
              href="/demo"
              className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              Videos &amp; embed →
            </Link>
          </p>
        </div>
      </section>

      {/* §how-it-works - compact titles; bodies on reveal. */}
      <section id="how-it-works" className="rule-t scroll-mt-20">
        <div className="reveal site-container py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            How the gate works
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)]">
            How does the gate catch a silent contract change?
          </h2>
          <p className="mt-3 mb-8 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            Agents trust tool descriptions like system prompts. MCP tools can change remotely
            with no version bump. The gate <strong>catches that change in-path</strong> before
            the call goes through.
          </p>
          <GateLoop compact />
          <div className="mt-12 rule-t pt-10">
            <PriorityGuides
              kicker="Read next"
              intro="Practical guides on silent drift, lockfiles, and how to screen a server before you wire it — then install the gate."
            />
          </div>
        </div>
      </section>

      {/* §install-paths - gate audit path + directory client (two jobs, labeled). */}
      <section id="install-paths" className="rule-t scroll-mt-20">
        <div className="site-container py-16 sm:py-20">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3 flex items-center gap-2">
            <Mark size={13} />
            Two install jobs
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)]">
            Gate first. Directory client only if you want discovery in-chat.
          </h2>
          <p className="mt-3 mb-6 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            <strong>Job 1 - gate</strong> (hero above): pins contracts and HOLDs drift in-path
            for {GATE_HOSTS_SHORT}. Ships as{' '}
            <code className="font-mono text-[13px] text-[var(--color-ink)]">mcpindex-gate</code>{' '}
            via uv from PyPI - no pipe-to-shell. Script alternative:{' '}
            <code className="font-mono text-[12.5px] text-[var(--color-ink)]">
              curl -fsSL https://mcpindex.ai/install.sh | sh
            </code>{' '}
            (audit it first with <code className="font-mono text-[12.5px] text-[var(--color-ink)]">| less</code>).
          </p>
          <div className="flex items-start gap-3 mb-8">
            <Seal size={34} ring="var(--color-rule)" bracket="var(--color-ink)" />
            <p className="text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
              Pinned, in-path, zero custody. Full wiring - including the auditable{' '}
              <code className="font-mono text-[12.5px] text-[var(--color-ink)]">uv tool install</code>{' '}
              path - is in the{' '}
              <Link
                href="/docs#install-the-gate"
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                docs
              </Link>
              .
            </p>
          </div>
          <div className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
            Job 2 - directory MCP client (advisory; does not install the gate)
          </div>
          <div className="space-y-4">
            <CopyField
              label="Claude Code"
              value={DISCOVERY_CLAUDE_MCP_ADD}
              notes="Adds mcp-server-mcpindex to Claude Code (user scope). Restart/reload MCP after."
            />
            <CopyField
              label="Gemini CLI"
              value={DISCOVERY_GEMINI_MCP_ADD}
              notes="Adds mcp-server-mcpindex to Gemini CLI (user scope). Restart gemini after."
            />
            <Disclose summary="npm global / JSON config (Cursor, Claude Desktop, Cline, Zed)">
              <CopyField
                label="npm global (or pick your host on /install)"
                value={DISCOVERY_NPM_GLOBAL}
                notes="Separate from the in-path gate. Tools: recommend_mcp_for_task, search_mcp_servers, compare_servers, check_tool_trust, assess_server, get_install_command. Per-host command or config: /install"
              />
            </Disclose>
          </div>
        </div>
      </section>

      {/* Dark trust band - short. */}
      <section className="rule-t bg-[var(--color-ink)]">
        <div className="reveal site-container py-16 sm:py-20">
          {/* zinc-400 (7.72:1 on ink), not zinc-500 (4.10:1 — under the 4.5 AA
              floor at this size). */}
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400 mb-3">
            Trust, stated plainly
          </div>
          <h2 className="t-h3 font-medium text-white">
            Does the gate hold your credentials?
          </h2>
          <p className="mt-3 mb-8 text-[14.5px] leading-[1.55] text-zinc-400">
            No. It diffs a tool&rsquo;s live contract against what you pinned, fails closed to a
            HOLD on doubt, and <strong className="text-zinc-300">never holds your keys</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* On ink, plain accent is the compliant hover (5.56:1); the
                -strong variant used everywhere else would drop this to 3.82:1. */}
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

      {/* Tier-3 depth - collapsed, content preserved. */}
      <section className="rule-t">
        <div className="site-container py-16 sm:py-20 space-y-8">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Dig deeper
          </div>

          <Disclose summary="Blast radius - grade the move, not just the tool">
            <p className="mb-3">
              A read and an irreversible delete look identical to your agent-both are
              &ldquo;a tool call.&rdquo; The gate labels each call&rsquo;s{' '}
              <strong>blast radius in the path</strong> before it runs: action (read, write,
              delete, send, execute), what it touches, whether it can be undone, and whether it
              leaves your org.
            </p>
            <p className="font-mono text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
              Deterministic and advisory. On by default in{' '}
              <code className="text-[var(--color-ink)]">@mcp-index/sdk</code> and{' '}
              <code className="text-[var(--color-ink)]">mcpindex-gate</code>. It never
              overrides the gate&rsquo;s HOLD/PROCEED decision.
            </p>
          </Disclose>

          <Disclose summary="Honest edges - what the gate claims and doesn’t">
            <p className="mb-6">
              A trust product earns trust by stating its edges. The gate says{' '}
              <strong>&ldquo;this contract changed,&rdquo;</strong> never &ldquo;this is safe.&rdquo;{' '}
              <Link
                href="/methodology"
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                Read the methodology
              </Link>
              .
            </p>
            <GateEdges />
          </Disclose>

          <Disclose summary="Directory corpus - screen verdicts and the drift ledger">
            <p className="mb-3">
              Before you wire a tool, the directory screens it (REVIEW or UNVERIFIED at v1). In
              the call path, the gate says <strong>HELD or PROCEED</strong>. Screen verdicts are
              semantic-only and advisory - never an ALLOW or DENY clearance (those unlock with
              the behavioral corpus).
            </p>
            <p className="mb-6">
              mcpindex also crawls the public MCP registry daily. Opt-in and
              crawler-corroborated drift never moves the decision. Every catch is public in the{' '}
              <Link
                href="/ledger"
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                live drift ledger
              </Link>
              .
            </p>
            {reveals.length > 0 && (
              <div className="mb-6">
                <VerdictReveal items={reveals} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/leaderboard"
                className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
              >
                Maturity Rankings →
              </Link>
              <Link
                href="/screen"
                className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
              >
                Screen →
              </Link>
              <Link
                href="/search"
                className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
              >
                Search →
              </Link>
              <span className="font-mono text-[11.5px] text-[var(--color-mute)]">
                {screened.length} servers screened · advisory, semantic-only
              </span>
            </div>
          </Disclose>

          <p className="font-mono text-[12px] text-[var(--color-mute)]">
            Overview films:{' '}
            <Link
              href="/demo"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              Concept &amp; persona videos →
            </Link>
            {' · '}
            <Link
              href="/whitepaper"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              Whitepaper →
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
