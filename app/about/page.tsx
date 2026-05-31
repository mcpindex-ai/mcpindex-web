import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description:
    'mcpindex.ai is the trust-to-act layer for agent tool use. Why it exists: the gap between a tool existing and an agent being safe to call it. Independent; unaffiliated with Anthropic.',
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        §01&nbsp;&nbsp;About
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
          (integrity, hidden intent, and others) and severity. Today an LLM
          judge reads the description for hidden instructions; findings are
          semantic-only and labeled PARTIAL. A deterministic conformance probe
          (does observed behavior match the declared schema?) is in build.
          History is OTS Bitcoin-anchored, so the trust record for a tool today
          cannot be quietly rewritten tomorrow.
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
          §02&nbsp;&nbsp;Author
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
          §03&nbsp;&nbsp;Affiliation
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
