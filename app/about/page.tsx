import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'mcpindex.ai is the trust-to-act layer for agent tool use. Why it exists: the gap between a tool existing and an agent being clear to call it without you watching. Independent; unaffiliated with Anthropic.',
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        About
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        The trust-to-act layer for agent tool use.
      </h1>
      <p className="mt-5 max-w-[640px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Agents discover tools at runtime, read the descriptions their authors
        wrote, and call them. mcpindex sits in the gap between &ldquo;the tool
        exists&rdquo; and &ldquo;the agent may invoke it without me watching.&rdquo;
      </p>

      <div className="mt-10 space-y-6 text-[15.5px] leading-[1.65] text-[var(--color-cite)]">
        <p>
          The official MCP registry at{' '}
          <a
            href="https://registry.modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            registry.modelcontextprotocol.io
          </a>{' '}
          is the canonical list of MCP servers. PulseMCP, Smithery, Glama, and
          MCP.so present human-browsable views on top of it. A list is the
          right primitive for discovery. It is not the right primitive for the
          decision an agent has to make next.
        </p>
        <p>
          That decision is the trust call. The MCP description is a contract
          the agent obeys the way it obeys a system prompt. If the description
          lies (instructs the agent to exfiltrate a key, claims schema
          validation it never runs, hides a destructive side effect inside a
          benign-sounding tool) the agent has no way to know. The agent will
          act. The user finds out after.
        </p>
        <p>
          mcpindex publishes a per-tool finding with dimension verdicts
          (integrity, hidden intent, and others) and severity. An LLM judge
          reads the description for hidden instructions, and a deterministic
          conformance probe checks whether observed behavior matches the
          declared schema. History is OTS Bitcoin-anchored, so once a block
          confirms, the trust record for a tool cannot be quietly rewritten.
        </p>
        <p>
          v1 is honest about its edges. Conformance is monitored, not enforced.
          OTS Bitcoin-anchored history with cadence bound = confirmation latency
          (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized);
          sub-window precision asserted, not proven. Confidences are reported but not yet calibrated
          (calibrated=false). Deployment posture is advisory: we publish the
          verdict; the agent or IDE decides whether to act on it. The
          graduation gate to D3 is &gt;=150 conforming labels with FP upper-95
          &lt;=2%; today the corpus stands at 15/150.
        </p>
        <p>
          The trust call happens at two moments, and mcpindex answers the same
          question at both: should my agent act on this tool, right now? Before
          you wire a tool, the directory screen is the prior &mdash; an advisory,
          semantic read of whether the description matches the behavior. During
          use, the drift gate is the live check: it pins each tool&rsquo;s
          contract and HOLDs a call the instant that contract silently changes,
          before your agent acts. The screen catches a lie at publish time; the
          gate catches the silent change at runtime &mdash; the gap nothing else
          covers, widening as agents get more autonomous. The gate is a
          deterministic contract-diff, in-path, dogfood-proven on Cursor; above
          that tier-0 it queries a cloud tier-1 corpus, escalates the ambiguous
          to a tier-2 LLM consult, and exercises a changed tool with a tier-3
          behavioral verifier. It is a contract-diff, not a safety verdict: the
          behavioral tier clears or refutes a change, it does not prove a tool
          safe.
        </p>
        <p>
          The two moments feed each other, and that loop is the network. Every
          drift the gate catches is a signal the corpus learns from; the corpus,
          as it grows, becomes the tier-1 lookup the gate queries before it
          decides. The gate alone is copyable. The corpus &times; the
          outcome-flywheel &times; the governance the screen enforces is the moat
          &mdash; the part that compounds and the part a competitor cannot clone
          by re-implementing a diff.
        </p>
        <p>
          Three primitives are exposed:{' '}
          <Link href="/llms.txt" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            an agent-readable index
          </Link>
          , the verdict surface on every server page, and a{' '}
          <a
            href="https://www.npmjs.com/package/mcp-server-mcpindex"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            drop-in MCP server
          </a>{' '}
          that exposes check_tool_trust to your agent. Architecture and
          integration notes are in{' '}
          <Link href="/docs" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            /docs
          </Link>
          ; the eval method and honest limits are at{' '}
          <Link href="/methodology" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            /methodology
          </Link>
          .
        </p>
      </div>

      <section className="mt-16 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Author
        </div>
        <h2 className="text-[22px] tracking-tight font-medium text-[var(--color-ink)]">
          Gautam Bharti
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--color-cite)]">
          Writes about agent infrastructure, platform design, and the MCP
          ecosystem. More analysis and research at{' '}
          <a
            href="https://seekgb.com"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            seekgb.com
          </a>
          .{' '}
          <a
            href="https://www.linkedin.com/in/gautambharti"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            LinkedIn
          </a>
          {' · '}
          <a href="mailto:hello@mcpindex.ai" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            hello@mcpindex.ai
          </a>
        </p>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Affiliation
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          mcpindex.ai is an independent research and engineering artifact. It
          is unaffiliated with Anthropic. The Model Context Protocol is open
          under MIT and trademarks remain with their owners. Server data comes
          from the official MCP registry; quality scoring, semantic ranking,
          and trust verdicts are produced locally from public artifacts and
          live probes.
        </p>
      </section>
    </article>
  );
}
