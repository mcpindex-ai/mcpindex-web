import Link from 'next/link';
import type { Metadata } from 'next';
import { D3_REQUIRED_LABELS, D3_PROGRESS } from '@/lib/honest-limits';

export const metadata: Metadata = {
  title: 'About',
  description:
    'mcpindex.ai is the in-path trust gate for agent tool calls. Why it exists: MCP tool contracts can change silently after an agent trusts them. Independent; unaffiliated with Anthropic.',
  alternates: { canonical: 'https://mcpindex.ai/about' },
};

export default function AboutPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        About
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Why the gate exists.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        mcpindex is the in-path trust gate for agent tool calls. Agents discover tools at
        runtime, read the descriptions their authors wrote, and call them. The Monday
        contract can change on Tuesday with no version bump. mcpindex pins each contract
        and HOLDs the call when it drifts - before the agent acts - and screens the
        directory so you can check a tool before you wire it.
      </p>

      <div className="mt-10 space-y-6 text-[15.5px] leading-[1.65] text-[var(--color-cite)]">
        <p>
          The official MCP registry at{' '}
          <a
            href="https://registry.modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
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
          (integrity, hidden intent, and others) and severity. Today the screen
          is semantic-only: an LLM judge reads the description for hidden
          instructions. The deterministic conformance probe - which checks
          whether observed behavior matches the declared schema - is built
          but has not yet run on the public corpus, so no published screen verdict
          carries a conformance result yet. History is OTS Bitcoin-anchored, so
          once a block confirms, the trust record for a tool cannot be quietly
          rewritten.
        </p>
        <p>
          v1 is honest about its edges. Conformance is built but not yet run on
          the screen; when it runs it is monitored, not enforced.
          OTS Bitcoin-anchored history with cadence bound = confirmation latency
          (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized);
          sub-window precision asserted, not proven. Confidences are reported but not yet calibrated
          (calibrated=false). Deployment posture is advisory: we publish the
          verdict; the agent or IDE decides whether to act on it. The
          graduation gate to D3 is &gt;={D3_REQUIRED_LABELS} conforming labels with FP upper-95
          &lt;=2%; today the corpus stands at {D3_PROGRESS}.
        </p>
        <p>
          The trust call happens at two moments, and mcpindex answers the same
          question at both: should my agent act on this tool, right now? Before
          you wire a tool, the directory screen is the prior: an advisory,
          semantic read of whether the description matches the behavior. During
          use, the drift gate is the live check. It pins each tool&rsquo;s
          contract and HOLDs a call the instant that contract silently changes,
          before your agent acts. The screen catches a lie at publish time; the
          gate catches the silent change at runtime, the gap nothing else
          covers, widening as agents get more autonomous.
        </p>
        <p>
          The gate is a deterministic contract-diff, in-path, and runs on your
          host. Above that live tier-0, the ladder is built as in-path seams: a
          cloud tier-1 corpus lookup, a tier-2 LLM consult on the ambiguous, and a
          tier-3 behavioral verifier that exercises a changed tool. Each is held
          off by default and requires explicit opt-in; the default build egresses
          nothing and stays fail-closed. It is a contract-diff, not a safety
          verdict: when enabled, the behavioral tier clears or refutes a change,
          it does not prove a tool safe.
        </p>
        <p>
          The two moments feed each other, and that loop is the network. The first
          turn is already live: mcpindex crawls the public registry every day and
          records every contract that drifts, and the gate can query that record to
          warn you on the first call - crawler-corroborated and opt-in. That
          record is public in the{' '}
          <Link href="/ledger" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">live drift ledger</Link>.
          The deeper tier-1 corpus lookup the gate queries before it decides is still
          held off by default. The gate alone is copyable, and open source by design.
          What compounds is behind it: the growing record of drift, the corpus of
          verdicts, and the published methodology that governs them. A competitor can
          re-implement a contract-diff in a weekend; they cannot re-implement the record.
        </p>
        <p>
          Three primitives are exposed:{' '}
          <Link href="/llms.txt" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            an agent-readable index
          </Link>
          , the verdict surface on every server page, and a{' '}
          <a
            href="https://www.npmjs.com/package/mcp-server-mcpindex"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            drop-in MCP server
          </a>{' '}
          that exposes check_tool_trust to your agent. Architecture and
          integration notes are in{' '}
          <Link href="/docs" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            /docs
          </Link>
          ; the eval method and honest limits are at{' '}
          <Link href="/methodology" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
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
          GB
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6] text-[var(--color-cite)]">
          Writes about agent infrastructure, platform design, and the MCP
          ecosystem. Reach the project at{' '}
          <a href="mailto:hello@mcpindex.ai" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            hello@mcpindex.ai
          </a>
          .
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
          and trust verdicts are produced locally from public artifacts (the
          tool description and schema). The deterministic behavioral probe is
          built but has not yet run on the public corpus.
        </p>
      </section>
    </article>
  );
}
