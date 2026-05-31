import Link from 'next/link';
import { LiveTicker } from '@/components/LiveTicker';
import { AgentDemo } from '@/components/AgentDemo';
import { ScreenDemo } from '@/components/ScreenDemo';
import { VerdictCard } from '@/components/VerdictCard';
import { CopyField } from '@/components/CopyField';
import { loadServers, getServerCount, getCategoryCount } from '@/lib/registry';
import { rankByQuality } from '@/lib/quality';
import { listScreened, isFlagged } from '@/lib/verdicts';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export default async function Home() {
  const [servers, count, categories, screened] = await Promise.all([
    loadServers(),
    getServerCount(),
    getCategoryCount(),
    listScreened(),
  ]);
  const top5 = rankByQuality(servers).slice(0, 5);
  // A real verdict to show once, for real. Prefer a flagged one (the product is
  // the catch); fall back gracefully. Never fabricate.
  const example =
    screened.find((s) => s.verdict.directive.decision === 'DENY') ??
    screened.find((s) => isFlagged(s.verdict)) ??
    screened.find((s) => s.verdict.directive.decision === 'REVIEW') ??
    screened[0] ??
    null;

  return (
    <>
      {/* §00 HERO - trust thesis + the live screener (the action) */}
      <section className="rule-b bg-[var(--color-accent-soft)]">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-12 pb-14 sm:pt-16 sm:pb-20">
          <div className="max-w-[820px]">
            <div className="hero-rise hero-rise-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-accent)] mb-6">
              §00&nbsp;&nbsp;Trust-to-act layer
            </div>
            <h1 className="hero-rise hero-rise-2 t-display font-medium text-[var(--color-ink)]">
              The trust layer for MCP tools.
            </h1>
            <p className="hero-rise hero-rise-3 mt-6 max-w-[600px] text-[17px] sm:text-[19px] leading-[1.5] text-[var(--color-cite)]">
              Your agent reads a tool&rsquo;s description and acts on it. Some descriptions
              lie. mcpindex returns a verdict on whether a tool does what it claims,
              before your agent calls it.
            </p>
          </div>

          {/* The action: live screener */}
          <div className="hero-rise hero-rise-4 mt-10 max-w-[820px]">
            <ScreenDemo />
          </div>

          {/* Primary CTA + stat line */}
          <div className="hero-rise hero-rise-4 mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <a
              href="#install"
              className="font-mono text-[12px] uppercase tracking-[0.16em] text-white bg-[var(--color-ink)] px-5 py-3 hover:bg-[var(--color-accent)] transition-colors"
            >
              Install the MCP server →
            </a>
            <Link
              href="/docs"
              className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-cite)] hover:text-[var(--color-accent)]"
            >
              Read the docs →
            </Link>
            <span className="font-mono text-[12px] text-[var(--color-mute)]">
              <span className="text-[var(--color-ink)] tabular-nums">{count.toLocaleString()}</span>{' '}
              servers indexed across {categories} categories · verdicts rolling out, adversarial
              cases first
            </span>
          </div>
        </div>
      </section>

      <LiveTicker />

      {/* §01 WATCH - the 90-second demo */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-14 sm:py-16">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            §01&nbsp;&nbsp;Watch
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)] max-w-[680px]">
            The trust-to-act layer, in 90 seconds.
          </h2>
          <p className="mt-3 mb-8 max-w-[620px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            Before your agent calls an MCP tool, mcpindex returns a verdict. Here is the whole
            loop, end to end.
          </p>
          <div className="max-w-[900px] rule-t rule-b rule-l rule-r bg-black">
            <video
              className="w-full aspect-video"
              controls
              playsInline
              preload="metadata"
              poster="/promo/poster.jpg"
            >
              <source src="/promo/mcpindex-promo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
          <div className="mt-4 font-mono text-[12px]">
            <Link href="/demo" className="text-[var(--color-cite)] hover:text-[var(--color-accent)]">
              full demo + embed code →
            </Link>
          </div>
        </div>
      </section>

      {/* §02 The verdict object - shown once, for real */}
      {example && (
        <section className="rule-t">
          <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
              §02&nbsp;&nbsp;The verdict object
            </div>
            <h2 className="t-h3 font-medium text-[var(--color-ink)] max-w-[680px]">
              A verdict, not a vibe.
            </h2>
            <p className="mt-3 mb-8 max-w-[620px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
              Per tool: a decision, the dimensions behind it, severity, and the honest limits
              shipped on every verdict. A real one, from the index.{' '}
              <Link
                href={`/server/${example.slug}`}
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
              >
                see the full page →
              </Link>
            </p>
            <div className="max-w-[760px]">
              <VerdictCard verdict={example.verdict} />
            </div>
          </div>
        </section>
      )}

      {/* §03 Three primitives */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-10">
            §03&nbsp;&nbsp;Three primitives
          </div>
          <PillarRow
            num="01"
            title="A verdict, not a ranking"
            body="Per-tool ALLOW / DENY / REVIEW with dimension verdicts and severity. Hybrid eval: deterministic conformance probe plus LLM judge for hidden intent. Conformance is monitored, not enforced; posture is advisory."
            code="curl -s mcpindex.ai/api/v1/trust/tool/<server_id>/<tool_name>"
          />
          <PillarRow
            num="02"
            title="Call it from your agent"
            body="Install the MCP server in Claude Desktop, Cursor, Cline, or Zed. Ask check_tool_trust before the agent invokes a tool it just discovered."
            code="npm install -g mcp-server-mcpindex"
          />
          <PillarRow
            num="03"
            title="Indexed directory + agent-readable feeds"
            body="Every server has a typed page. The same data is exposed as JSON-LD plus /llms.txt, /llms-full.txt, and /.well-known/mcp-index.json so an agent crawler finds the endpoints without parsing hero copy."
            code="curl -s mcpindex.ai/llms.txt"
          />
        </div>
      </section>

      {/* §04 Two axes - quality leaderboard (secondary) */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="flex items-baseline justify-between gap-6 mb-10">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
                §04&nbsp;&nbsp;Two axes
              </div>
              <h2 className="mt-3 t-h3 font-medium text-[var(--color-ink)]">
                Popular is not the same as honest.
              </h2>
              <p className="mt-3 max-w-[560px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
                One axis is maturity from public registry signal. The other is the trust verdict:
                does the tool behave the way its description claims. The product is the gap between
                them. Verdict axis in evaluation, adversarial cases first.{' '}
                <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]">
                  Read methodology
                </Link>
                .
              </p>
            </div>
            <Link
              href="/leaderboard"
              className="hidden sm:inline-block font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-cite)] hover:text-[var(--color-accent)] whitespace-nowrap"
            >
              see both axes →
            </Link>
          </div>

          <ol className="rule-t">
            {top5.map((row, i) => (
              <li
                key={row.server.slug}
                className="rule-b grid grid-cols-[40px_1fr_auto] sm:grid-cols-[60px_1fr_140px_120px] gap-4 px-2 py-5 items-baseline group hover:bg-[var(--color-accent-soft)]/40 transition-colors"
              >
                <span className="font-mono text-[12px] text-[var(--color-mute)] tabular-nums">
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/server/${row.server.slug}`}
                    className="block font-medium text-[15px] text-[var(--color-ink)] group-hover:text-[var(--color-accent)] truncate transition-colors"
                  >
                    {row.server.title}
                  </Link>
                  <div className="mt-0.5 font-mono text-[11px] text-[var(--color-mute)] truncate">
                    {row.server.name}
                  </div>
                </div>
                <div className="hidden sm:block font-mono text-[11px] text-[var(--color-mute)] truncate">
                  {CATEGORY_LABELS[row.server.category] ?? row.server.category}
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-[22px] text-[var(--color-ink)]">{row.score}</span>
                  <span className="text-[11px] text-[var(--color-mute)] ml-1">/100</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* §05 Also a directory - discovery, demoted below the trust story */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            §05&nbsp;&nbsp;Also a directory
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)] max-w-[680px]">
            Find the tool, then check the verdict.
          </h2>
          <p className="mt-3 mb-10 max-w-[620px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            Discovery is how you arrive; the verdict is why you would trust the call. Search the
            directory, open a server, read the trust state before the agent moves.
          </p>
          <div className="max-w-[800px]">
            <AgentDemo serverCount={count} />
          </div>
        </div>
      </section>

      {/* §06 Honest about the edges */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            §06&nbsp;&nbsp;Honest about the edges
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)] max-w-[680px]">
            What we don&apos;t claim.
          </h2>
          <p className="mt-3 mb-10 max-w-[620px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            A trust product earns trust by stating its edges. We ship these limits on every
            verdict.{' '}
            <Link href="/methodology" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]">
              Read the methodology
            </Link>
            .
          </p>
          <div className="grid sm:grid-cols-2 rule-t rule-l">
            {[
              ['Advisory', 'We publish the verdict; the agent or IDE decides whether to act on it.'],
              ['Conformance monitored, not enforced', 'The deterministic schema-conformance probe is in build; today findings are semantic-only and labeled PARTIAL.'],
              ['15 of 150 labels to graduation', 'Coverage rolls out as the corpus expands, adversarial cases first.'],
              ['Not yet calibrated', 'Confidences are reported but not calibrated against a production corpus (calibrated=false at v1).'],
            ].map(([k, v]) => (
              <div key={k} className="rule-b rule-r p-5 sm:p-6">
                <div className="font-mono text-[12.5px] text-[var(--color-ink)]">{k}</div>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-cite)]">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §07 Install + API + waitlist */}
      <section id="install" className="rule-t scroll-mt-20">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-24">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            §07&nbsp;&nbsp;Use it now
          </div>
          <h2 className="t-h3 font-medium text-[var(--color-ink)] max-w-[680px]">
            Free, and live now.
          </h2>
          <p className="mt-3 mb-10 max-w-[620px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
            Install the MCP server, or call the verdict API directly. No key required for the
            free tier.
          </p>
          <div className="grid md:grid-cols-2 gap-10 items-start">
            <div className="space-y-5">
              <CopyField
                label="MCP server (Claude Desktop, Cursor, Cline, Zed)"
                value="npm install -g mcp-server-mcpindex"
              />
              <CopyField
                label="Verdict API"
                value="curl -s mcpindex.ai/api/v1/trust/tool/<server_id>/<tool_name>"
              />
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)] mb-3">
                Or get one email when v1 opens
              </div>
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function PillarRow({
  num,
  title,
  body,
  code,
}: {
  num: string;
  title: string;
  body: string;
  code: string;
}) {
  return (
    <div className="rule-t first:border-t group grid grid-cols-[60px_1fr] sm:grid-cols-[80px_1fr_minmax(280px,460px)] gap-6 sm:gap-10 py-10 hover:bg-[var(--color-accent-soft)]/30 transition-colors px-2">
      <div className="font-mono text-[12px] text-[var(--color-accent)] tabular-nums pt-1">{num}</div>
      <div>
        <h3 className="t-h4 font-medium text-[var(--color-ink)]">{title}</h3>
        <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--color-cite)] max-w-[480px]">
          {body}
        </p>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[11.5px] overflow-x-auto leading-snug">
          <code>$ {code}</code>
        </pre>
      </div>
    </div>
  );
}

function WaitlistForm() {
  return (
    <form
      action="/api/waitlist"
      method="post"
      className="flex w-full max-w-[480px] rule-t rule-b rule-l rule-r"
    >
      <input
        name="email"
        type="email"
        required
        placeholder="you@company.com"
        className="flex-1 px-4 py-3 font-mono text-[13px] text-[var(--color-ink)] placeholder-[var(--color-mute)] outline-none bg-white"
        aria-label="Email address"
      />
      <button
        type="submit"
        className="font-mono text-[12px] uppercase tracking-[0.16em] text-white bg-[var(--color-ink)] px-5 hover:bg-[var(--color-accent)] transition-colors"
      >
        Notify me →
      </button>
    </form>
  );
}
