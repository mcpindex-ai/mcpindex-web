import Link from 'next/link';
import { LiveTicker } from '@/components/LiveTicker';
import { AgentDemo } from '@/components/AgentDemo';
import { loadServers, getServerCount, getCategoryCount } from '@/lib/registry';
import { rankByQuality } from '@/lib/quality';
import { CATEGORY_LABELS } from '@/lib/categorize';

export const revalidate = 3600;

export default async function Home() {
  const [servers, count, categories] = await Promise.all([
    loadServers(),
    getServerCount(),
    getCategoryCount(),
  ]);
  const top5 = rankByQuality(servers).slice(0, 5);

  return (
    <>
      {/* Hero teaser - the trust-layer claim, above the fold. */}
      <section className="rule-b bg-[--color-accent-soft]">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-12 pb-14 sm:pt-16 sm:pb-20">
          <div className="max-w-[820px]">
            <div className="hero-rise hero-rise-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-accent] mb-6">
              §00&nbsp;&nbsp;Trust-to-act layer
            </div>
            <h2 className="hero-rise hero-rise-2 t-display font-medium text-[--color-ink]">
              The trust-to-act layer for agent tool use.
            </h2>
            <div className="hero-rise hero-rise-3 mt-7 space-y-4 text-[15px] sm:text-[16.5px] leading-[1.55] text-[--color-cite]">
              <p>
                Your agent discovers an MCP tool at runtime, reads the
                description the publisher wrote, and acts. The description is
                the contract. Some descriptions lie. A read_file tool whose
                instructions also tell your agent to grab ~/.ssh/id_rsa and
                stay quiet about it. A schema that claims validation it never
                runs. The agent can&apos;t tell on its own.
              </p>
              <p>
                The ecosystem&apos;s answer so far is a longer list. A list
                tells you a tool exists. It does not tell you the tool is
                honest, or whether it still is.
              </p>
              <p>
                mcpindex publishes a verdict per tool: ALLOW, DENY, or REVIEW,
                with the dimensions and severity behind the call. A deterministic
                conformance probe checks whether behavior matches the declared
                schema. An LLM judge reads the description for hidden intent.
                Both legs execute and are recorded.
              </p>
              <p>
                v1 is honest about its edges. Conformance is monitored, not
                enforced. History is OTS Bitcoin-anchored with a cadence bound
                equal to confirmation latency (~10 minutes to ~1 hour for 1 to
                6 confirmations); sub-window timing is asserted, not proven.
                Confidences are not yet calibrated. Posture is advisory: we
                publish the verdict; the agent or IDE decides whether to act
                on it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Top ticker - sits ABOVE header per design */}
      <LiveTicker />

      {/* Hero */}
      <section className="relative">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="max-w-[820px]">
            <div className="hero-rise hero-rise-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-8">
              §01&nbsp;&nbsp;Find a tool, then check the verdict
            </div>
            <h1 className="hero-rise hero-rise-2 t-display font-medium text-[--color-ink]">
              Where agents find MCP tools, and the verdict on whether to act through them.
            </h1>
            <p className="hero-rise hero-rise-3 mt-8 text-[17px] sm:text-[19px] leading-[1.45] text-[--color-cite]">
              Discovery is how you arrive. The verdict is why you&apos;d trust
              the call. Both live on the same page: search the directory,
              open a server, read the trust state before the agent moves.
            </p>

            <div className="hero-rise hero-rise-3 mt-7 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[12.5px] text-[--color-mute]">
              <span>
                <span className="text-[--color-ink] tabular-nums">{count.toLocaleString()}</span>{' '}
                MCP servers indexed across {categories} categories.
              </span>
              <span className="text-[--color-rule]">·</span>
              <span>
                Verdicts rolling out; adversarial cases first.
              </span>
              <span className="text-[--color-rule]">·</span>
              <span>
                Source:{' '}
                <a
                  href="https://registry.modelcontextprotocol.io"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[--color-cite] hover:text-[--color-accent]"
                >
                  registry.modelcontextprotocol.io
                </a>
              </span>
            </div>
          </div>

          {/* Demo */}
          <div className="hero-rise hero-rise-4 mt-16 max-w-[800px]">
            <AgentDemo />
          </div>
        </div>
      </section>

      {/* Three primitives */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-10">
            §02&nbsp;&nbsp;Three primitives
          </div>

          <PillarRow
            num="01"
            title="Indexed directory + agent-readable feeds"
            body="Every server has a typed page. The same data is exposed as JSON-LD plus /llms.txt, /llms-full.txt, and /.well-known/mcp-index.json so an agent crawler finds the endpoints without parsing hero copy."
            code="curl -s mcpindex.ai/llms.txt"
          />
          <PillarRow
            num="02"
            title="A verdict, not a ranking"
            body="Per-tool ALLOW / DENY / REVIEW with dimension verdicts and severity. Hybrid eval: deterministic conformance probe plus LLM judge for hidden intent. Conformance is monitored, not enforced; posture is advisory."
            code='curl -s "mcpindex.ai/api/v1/verdict?server=<slug>&tool=<name>"'
          />
          <PillarRow
            num="03"
            title="Call it from your agent"
            body="Install the MCP server in Claude Desktop, Cursor, Cline, or Zed. Ask check_tool_trust before the agent invokes a tool it just discovered."
            code="npm install -g mcp-server-mcpindex"
          />
        </div>
      </section>

      {/* Quality leaderboard strip - the directory still does its job */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="flex items-baseline justify-between gap-6 mb-10">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
                §03&nbsp;&nbsp;Two axes
              </div>
              <h2 className="mt-3 t-h3 font-medium text-[--color-ink]">
                Popular is not the same as honest. Both axes show up on every page.
              </h2>
              <p className="mt-3 max-w-[560px] text-[14.5px] leading-[1.55] text-[--color-cite]">
                One axis is maturity from public registry signal: freshness,
                completeness, installability, documentation, semver stability.
                The other is the trust verdict: does the tool behave the way
                its description claims. The product is the gap between them.
                Verdict axis in evaluation, adversarial cases first.{' '}
                <Link href="/methodology" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent] hover:decoration-[--color-accent]">
                  Read methodology
                </Link>
                .
              </p>
            </div>
            <Link
              href="/leaderboard"
              className="hidden sm:inline-block font-mono text-[12px] uppercase tracking-[0.16em] text-[--color-cite] hover:text-[--color-accent] whitespace-nowrap"
            >
              see both axes →
            </Link>
          </div>

          <ol className="rule-t">
            {top5.map((row, i) => (
              <li
                key={row.server.slug}
                className="rule-b grid grid-cols-[40px_1fr_auto] sm:grid-cols-[60px_1fr_140px_120px] gap-4 px-2 py-5 items-baseline group hover:bg-[--color-accent-soft]/40 transition-colors"
              >
                <span className="font-mono text-[12px] text-[--color-mute] tabular-nums">
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/server/${row.server.slug}`}
                    className="block font-medium text-[15px] text-[--color-ink] group-hover:text-[--color-accent] truncate transition-colors"
                  >
                    {row.server.title}
                  </Link>
                  <div className="mt-0.5 font-mono text-[11px] text-[--color-mute] truncate">
                    {row.server.name}
                  </div>
                </div>
                <div className="hidden sm:block font-mono text-[11px] text-[--color-mute] truncate">
                  {CATEGORY_LABELS[row.server.category] ?? row.server.category}
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-[22px] text-[--color-ink]">{row.score}</span>
                  <span className="text-[11px] text-[--color-mute] ml-1">/100</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Email capture */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-24">
          <div className="grid md:grid-cols-2 gap-10 items-end">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
                §04&nbsp;&nbsp;Mailing list
              </div>
              <h2 className="mt-3 t-h3 font-medium text-[--color-ink]">
                Get the verdict API when v1 opens.
              </h2>
              <p className="mt-3 text-[14.5px] leading-[1.55] text-[--color-cite] max-w-[480px]">
                One email when the verdict API opens. No catalog spam.
              </p>
            </div>

            <WaitlistForm />
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
    <div className="rule-t first:border-t group grid grid-cols-[60px_1fr] sm:grid-cols-[80px_1fr_minmax(280px,460px)] gap-6 sm:gap-10 py-10 hover:bg-[--color-accent-soft]/30 transition-colors px-2">
      <div className="font-mono text-[12px] text-[--color-accent] tabular-nums pt-1">
        {num}
      </div>
      <div>
        <h3 className="t-h4 font-medium text-[--color-ink]">
          {title}
        </h3>
        <p className="mt-2 text-[14.5px] leading-[1.55] text-[--color-cite] max-w-[480px]">
          {body}
        </p>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <pre className="bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[11.5px] overflow-x-auto leading-snug">
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
        className="flex-1 px-4 py-3 font-mono text-[13px] text-[--color-ink] placeholder-[--color-mute] outline-none bg-white"
        aria-label="Email address"
      />
      <button
        type="submit"
        className="font-mono text-[12px] uppercase tracking-[0.16em] text-white bg-[--color-ink] px-5 hover:bg-[--color-accent] transition-colors"
      >
        Get API key →
      </button>
    </form>
  );
}
