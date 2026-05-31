import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How mcpindex evaluates MCP tools. Hybrid eval (deterministic conformance probe + LLM judge), four-state verdict, OTS Bitcoin-anchored history; Bitcoin-finalized at N=6 confirmations (~1 hr); pending in ~10 min. Honest limits at v1 advisory.',
};

export default function MethodologyPage() {
  return (
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Methodology · v1 advisory
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        How a verdict is produced.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)] max-w-[680px]">
        mcpindex evaluates MCP tools and publishes a finding per tool. Today
        an LLM judge reads the tool description for hidden instructions, bound
        to the exact tool definition that was seen (tool_definition_hash). A
        deterministic conformance probe is in build; until it ships, findings
        are semantic-only and labeled PARTIAL. The finding is what an agent
        reads before it calls.
      </p>

      <section className="mt-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Hybrid eval
        </div>
        <ul className="rule-t">
          <Dim
            label="Conformance probe"
            kind="deterministic"
            body="Drives the tool against its declared schema and checks whether observed behavior matches what the description claims. Output is a pass/fail dimension verdict with a captured trace. At v1 the probe is MONITORED, not enforced: a conformance fail surfaces in the verdict; it does not block the call upstream."
          />
          <Dim
            label="Intent judge"
            kind="LLM"
            body="Reads the tool description, schema, and example outputs adversarially. Flags hidden instructions, exfiltration patterns, prompt-injection payloads, and overclaims (e.g. 'validates' a field it never checks). Output is a pass/fail dimension verdict with rationale and severity."
          />
          <Dim
            label="History"
            kind="OTS"
            body="OTS Bitcoin-anchored history with cadence bound = confirmation latency (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized); sub-window precision asserted, not proven. The verdict stream for a tool is hash-chained and timestamped via OpenTimestamps; the chain is auditable end-to-end once a block confirms."
          />
        </ul>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Four-state verdict
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)] max-w-[680px]">
          The directive an agent reads is one of three decisions, on top of a
          status that says how the eval went. Together they are four states an
          agent must distinguish.
        </p>
        <ul className="rule-t mt-6">
          <Dim
            label="ALLOW"
            kind="decision"
            body="The eval ran end-to-end and the tool cleared its checks at the recorded clearance level. The agent may invoke within that clearance until expires_at."
          />
          <Dim
            label="DENY"
            kind="decision"
            body="The eval ran end-to-end and a finding crossed the deny threshold (high-severity intent flag, conformance regression, or a poisoned description). The agent should not invoke."
          />
          <Dim
            label="REVIEW"
            kind="decision"
            body="The eval ran but produced ambiguous or partial findings (e.g. medium-severity flag, partial conformance, provider disagreement). Surfaces the dimension findings; agent should defer to a human or fall back to its own checks."
          />
          <Dim
            label="UNVERIFIED"
            kind="status"
            body="No verdict on file for this tool yet (the wire term the trust API returns when a tool has not been screened). The agent should NOT infer trust; treat as not-yet-cleared. Coverage rolls out as the corpus expands (adversarial cases first)."
          />
        </ul>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Honest limits (v1)
        </div>
        <ul className="space-y-3 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          <li><span className="text-[var(--color-accent)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Definition, not runtime.</strong> The eval is bound to the tool definition (description + schema) at evaluation time. Runtime behavior on a specific call is not covered.</li>
          <li><span className="text-[var(--color-accent)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Conformance monitored, not enforced.</strong> A conformance fail is reported in the verdict and the public surface. It is not enforced on the wire.</li>
          <li><span className="text-[var(--color-accent)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">OTS cadence bound = confirmation latency.</strong> The OTS anchor proves the verdict existed by some Bitcoin block; it does not prove minute-level ordering inside the confirmation window.</li>
          <li><span className="text-[var(--color-accent)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">calibrated = false at v1.</strong> Confidence scores are reported but not calibrated against a held-out adversarial corpus yet.</li>
          <li><span className="text-[var(--color-accent)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Advisory, not blocking.</strong> mcpindex publishes the verdict. The agent or IDE decides whether to act.</li>
          <li><span className="text-[var(--color-accent)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">D3 graduation gate.</strong> &gt;=150 conforming labels with FP upper-95 &lt;=2%. Current: 15/150.</li>
        </ul>
        <p className="mt-6 text-[14px] text-[var(--color-cite)] leading-[1.6] max-w-[680px]">
          The honest-limits list is a contract. If any of these stops being
          true, the methodology page changes first, the verdict surface
          changes second, and the network only sees the upgrade after both.
        </p>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Quality score (directory axis)
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)] max-w-[680px]">
          The trust verdict answers &ldquo;does this tool behave as it
          claims.&rdquo; The directory still answers a simpler question:
          which servers look mature from public registry signal. The 0-100
          MCP Quality Score is a public-data composite (freshness,
          completeness, installability, documentation, semver stability) and
          remains the secondary axis on every page. Source:{' '}
          <a
            href="https://github.com/mcpindex-ai/mcpindex-web/blob/main/lib/quality.ts"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            lib/quality.ts
          </a>
          .
        </p>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Cite this
        </div>
        <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
          <code>{`Bharti, G. "mcpindex: the trust-to-act layer for agent tool use." mcpindex.ai/methodology, 2026.
https://mcpindex.ai/methodology`}</code>
        </pre>
        <p className="mt-4 text-[13.5px] text-[var(--color-cite)]">
          Or just{' '}
          <Link href="/leaderboard" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            link to a server&apos;s detail page
          </Link>
          . The verdict surface and the score breakdown both render there.
        </p>
      </section>
    </article>
  );
}

function Dim({
  label,
  kind,
  body,
}: {
  label: string;
  kind: string;
  body: string;
}) {
  return (
    <li className="rule-b grid grid-cols-[160px_90px_1fr] gap-4 py-5 px-2 items-baseline">
      <div className="font-mono text-[12.5px] uppercase tracking-[0.12em] text-[var(--color-ink)]">
        {label}
      </div>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-mute)]">
        {kind}
      </div>
      <p className="text-[14px] leading-[1.55] text-[var(--color-cite)]">{body}</p>
    </li>
  );
}
