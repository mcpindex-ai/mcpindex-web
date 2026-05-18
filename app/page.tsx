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
      {/* Teaser — sits at the very TOP, above the fold, above ticker + header */}
      <section className="rule-b bg-[--color-accent-soft]">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-12 pb-14 sm:pt-16 sm:pb-20">
          <div className="max-w-[940px]">
            <div className="hero-rise hero-rise-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-accent] mb-6">
              §00&nbsp;&nbsp;Trust layer
            </div>
            <h2 className="hero-rise hero-rise-2 t-h2 font-medium text-[--color-ink]">
              Your agent is about to call a tool it found 200ms ago. Did anyone read what it actually does?
            </h2>
            <div className="hero-rise hero-rise-3 mt-7 space-y-4 max-w-[680px] text-[15px] sm:text-[16.5px] leading-[1.55] text-[--color-cite]">
              <p>
                Your agent discovers an MCP tool at runtime, reads its
                description, and acts. The description was written by whoever
                shipped the tool. Some of them lie. A read_file tool whose
                description also instructs your agent to grab ~/.ssh/id_rsa
                first and stay quiet about it. A schema that claims it validates
                input it never checks. Your agent can&apos;t tell. It obeys tool
                descriptions the way it obeys you.
              </p>
              <p>
                The ecosystem&apos;s answer is a bigger list - thousands of
                servers ranked by stars. A list tells you a tool exists. It does
                not tell you the tool is honest.
              </p>
              <p>
                mcpindex reads the tool adversarially before your agent does. A
                deterministic check that its behavior matches its declared
                contract, plus a judge for hidden intent, written to a record
                you can audit. One verdict, before the call.
              </p>
              <p>
                A trust vendor that overclaims is self-refuting, so we publish
                what&apos;s proven versus in-flight and our thresholds are fixed
                before the evidence. The list era of MCP is ending. Watch this
                space.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Top ticker — sits ABOVE header per design */}
      <LiveTicker />

      {/* Hero */}
      <section className="relative">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <div className="max-w-[940px]">
            <div className="hero-rise hero-rise-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-8">
              §01&nbsp;&nbsp;The trust layer
            </div>
            <h1 className="hero-rise hero-rise-2 t-display font-medium text-[--color-ink]">
              Where agents find MCP tools, and the verdict on whether to act through them.
            </h1>
            <p className="hero-rise hero-rise-3 mt-8 max-w-[680px] text-[17px] sm:text-[19px] leading-[1.45] text-[--color-cite]">
              Finding a tool is table stakes. Before your agent acts through one, you get a
              verdict on whether it does what it claims. Discovery is how you arrive; the verdict
              is why you&apos;d trust the call.
            </p>

            <div className="hero-rise hero-rise-3 mt-7 flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-[12.5px] text-[--color-mute]">
              <span>
                <span className="text-[--color-ink] tabular-nums">{count.toLocaleString()}</span>{' '}
                MCP servers indexed. Verdicts rolling out, adversarial cases first.
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
          <div className="hero-rise hero-rise-4 mt-16 max-w-[940px]">
            <AgentDemo />
          </div>
        </div>
      </section>

      {/* Three pillars — editorial rows */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-10">
            §02&nbsp;&nbsp;Three primitives
          </div>

          <PillarRow
            num="01"
            title="Agent-readable index"
            body="Every page exposes JSON-LD plus /llms.txt, /llms-full.txt, and /.well-known/mcp-index.json. Agent crawlers find the endpoints without parsing hero copy."
            code="curl -s mcpindex.ai/llms.txt"
          />
          <PillarRow
            num="02"
            title="A verdict, not a ranking"
            body="Ask about a tool. Get whether its behavior matches its declared contract and whether its intent reads honest, with the evidence behind the call, not a popularity score."
            code='curl -s "mcpindex.ai/api/v1/recommend?task=read+pdf+to+s3"'
          />
          <PillarRow
            num="03"
            title="Query it from your agent"
            body="Install the server in Claude Desktop, Cursor, Cline, or Zed and ask for the verdict on a tool before your agent calls it."
            code="npm install -g mcp-server-mcpindex"
          />
        </div>
      </section>

      {/* Quality leaderboard strip */}
      <section className="rule-t">
        <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-20 sm:py-28">
          <div className="flex items-baseline justify-between gap-6 mb-10">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
                §03&nbsp;&nbsp;Two axes
              </div>
              <h2 className="mt-3 t-h3 font-medium text-[--color-ink]">
                Popular is not the same as honest. We show both axes.
              </h2>
              <p className="mt-3 max-w-[560px] text-[14.5px] leading-[1.55] text-[--color-cite]">
                One axis is maturity from public signal: freshness, completeness,
                installability, documentation, semver stability. The other is the verdict:
                does the tool do what it claims. The product is the gap between them.
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
              full leaderboard →
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
                Get the verdict API when v1 ships.
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

// Inline waitlist form — kept here (server component renders the markup, htmx-style POST via fetch
// handled by an inline 'use client' island below if we needed it; for simplicity we use a plain
// form posting to /api/waitlist with progressive enhancement).
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
