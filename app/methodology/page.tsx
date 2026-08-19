import Link from 'next/link';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { D3_REQUIRED_LABELS, D3_PROGRESS } from '@/lib/honest-limits';

export const metadata: Metadata = pageMetadata({
  title: 'Methodology',
  description:
    'How mcpindex evaluates MCP tools. At v1 the screen is semantic-only (an LLM judge reads the description); the deterministic conformance probe is built but has not run on the public corpus yet. Four-state verdict, OTS hash-chained history; Bitcoin-finalized at N=6 confirmations (~1 hr); pending in ~10 min. Honest limits at v1 advisory.',
  path: '/methodology',
});

export default function MethodologyPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Methodology · v1 advisory
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        How a verdict is produced.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        mcpindex evaluates MCP tools and publishes a finding per tool. Today
        every published screen verdict is semantic-only: an LLM judge reads the
        tool description for hidden instructions, bound to the exact tool
        definition that was seen (tool_definition_hash). The deterministic
        conformance probe is built but has not yet run against the public
        corpus - so a conforming ALLOW (which the probe would have to earn)
        is not produced at v1; the screen emits REVIEW or UNVERIFIED. The finding
        is what an agent reads before it calls. Confidence is reported but not
        yet calibrated (calibrated=false) - the honest limits below.
      </p>

      <section className="mt-12">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          The eval
        </div>
        <ul className="rule-t">
          <Dim
            label="Conformance probe"
            kind="roadmap"
            body="Built but not yet run on the public corpus. When it runs, it drives the tool against its declared schema and checks whether observed behavior matches what the description claims (a pass/fail dimension verdict with a captured trace), gated to the D3 labeled-corpus milestone. At v1 it is built-not-run on the screen: no public verdict carries a conformance result yet, and a conformance result, when it lands, will be monitored, not enforced - it surfaces in the verdict; it does not block the call upstream."
          />
          <Dim
            label="Intent judge"
            kind="LLM"
            body="Reads the tool description, schema, and example outputs adversarially. Flags hidden instructions, exfiltration patterns, prompt-injection payloads, and overclaims (e.g. 'validates' a field it never checks). Output is a pass/fail dimension verdict with rationale and severity."
          />
          <Dim
            label="History"
            kind="OTS"
            body="OTS hash-chained history with cadence bound = confirmation latency (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized); sub-window precision asserted, not proven. The verdict stream for a tool is hash-chained and timestamped via OpenTimestamps; the chain is auditable end-to-end once a block confirms, and `python3 scripts/verify_anchors.py` in the site repository reproduces every anchor from the published corpus (recipe: docs/verifying-anchors.md)."
          />
        </ul>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          The drift gate method
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          The screen above is the prior an agent reads before it wires a tool.
          The drift gate is the live, in-path check during use. It answers a
          narrower, provable question: did this tool&rsquo;s contract change
          since you pinned it? The verdict is a contract-diff, not a safety
          verdict - but the gate sits in the call path, so it can HOLD the
          call before your agent acts on the change, not merely report it after.
          The gate runs deterministically and entirely on your host. Its
          verdicts are produced by the live gate code, not a hand-written
          table; the reproducible scenario battery is documented in the{' '}
          <Link
            href="/whitepaper"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            whitepaper
          </Link>
          .
        </p>
        <ul className="rule-t mt-6">
          <Dim
            label="TOFU pin"
            kind="baseline"
            body="On first sight of a tool (the client's tools/list), the gate pins the tool's contract trust-on-first-use: a hash over name + description + input schema, plus the captured schema. The pin can persist across restarts, so a contract that changes while your agent is offline is still caught on the next call. The first-seen contract is the baseline; the gate cannot catch drift that happened before it was installed."
          />
          <Dim
            label="Contract-diff"
            kind="deterministic"
            body="On a call, the gate re-derives the live contract and compares it to the pin. A mismatch is classified into a fixed taxonomy (ChangeKind): added-required-param, required-set-expanded, constraint-narrowed, type-changed, enum-values-removed, removed-param, annotation-flip-to-destructive, output-schema-added, output-schema-changed, tool-added/removed. It also scans for injection/exfil markers in the input AND output schema and the description. No LLM, no scoring you cannot trace; a structural surprise it cannot classify fails closed (deep-schema-undiffable), never open."
          />
          <Dim
            label="Postures"
            kind="policy"
            body="Monitor never blocks: every drift returns proceed-with-note. Guard (default) holds the unambiguously-breaking and dangerous changes while letting a proven-benign drift through; two kinds where behaviour is the gate (annotation-flip-to-destructive, output-schema-changed) resolve to INCONCLUSIVE rather than a flat block. Strict holds everything it cannot prove benign - NOT every drift: the benign auto-accept (added optional param, new tool, first-time output schema; description byte-identical, no risk escalation, no marker) runs BEFORE the posture layer, so a proven-benign change is re-pinned and proceeds under strict too. Anything else holds before the call."
          />
        </ul>
        <Figure id="tier-ladder">{renderDiagram('tier-ladder')}</Figure>
        <Figure id="posture-matrix">{renderDiagram('posture-matrix')}</Figure>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mt-10 mb-4">
          Honest limits (the gate)
        </div>
        <ul className="space-y-3 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Contract-diff, not a safety verdict.</strong> A HOLD means &ldquo;this tool&rsquo;s contract changed vs what you pinned&rdquo; - not that the new contract is unsafe. You review the before/after and re-pin if the change is expected.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Advisory in judgment, in-path in effect.</strong> The gate does not assert a tool is safe; it asserts what changed. Because it sits in the call path, that judgment can actually HOLD the call - a passive scanner can only alert after the fact.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Deterministic tier-0 live; tiers 1-3 built but held off by default.</strong> The contract-diff is deterministic, runs first, and is the live, deterministic leg. Above it the ladder is built as in-path seams - a cloud tier-1 corpus lookup (a contract judged once clears or condemns it everywhere), a tier-2 LLM consult on the ambiguous, and a tier-3 behavioral verifier that exercises a changed tool to clear or refute the change - but each is held off by default and requires explicit opt-in; the default build egresses nothing and stays fail-closed. When enabled, the behavioral tier clears or refutes a contract change; it is not a proof of safety, and confidence is reported but not yet calibrated (calibrated=false at v1).</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Fail-closed.</strong> A tool with no pin, an unreadable contract, or a diff the gate cannot complete holds rather than proceeds. The gate never silently allows what it could not verify.</li>
        </ul>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          The drift network method
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          The in-path gate catches a change the first time you see it. The drift network catches it
          before you do. mcpindex crawls the public MCP registry every day, re-derives each
          tool&rsquo;s contract, and records every silent change as a fingerprint-only entry. When
          you pin a tool, the gate can ask the network one question: has the crawler already caught
          this contract drifting? If it has, you are warned on the first call - a contract-diff
          advisory that rides alongside the verdict and never moves PROCEED or HOLD. Every drift the
          crawler catches is public in the{' '}
          <Link href="/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">drift ledger</Link>{' '}
          and analyzed, deduped and citable, in{' '}
          <Link href="/drift-report" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">The MCP Drift Report</Link>.
        </p>
        <ul className="space-y-3 text-[14.5px] leading-[1.6] text-[var(--color-cite)] mt-5">
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Crawler-corroborated, not crowd-sourced.</strong> The public corroboration count floors at the crawler (one first-party source); forgeable install reports are excluded from the public number. The warning is real today because the crawler sees the drift, not because other installs reported it.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Opt-in, privacy-by-construction.</strong> Off by default. When enabled, the only thing that leaves is a salted (HMAC) fingerprint plus closed-vocabulary fields (change type, safety flag, hour-rounded time) - never a schema, argument, description, URL, or server/tool name. Fail-open: it never blocks or changes a call.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Advisory, never the decision.</strong> The fleet advisory informs; the gate&rsquo;s deterministic contract-diff still decides. The network can raise your attention; it cannot move a PROCEED or a HOLD.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Tool removals counted (as of 2026-07-19).</strong> The ledger also records when a tool present in one snapshot is absent from the next, scoped to servers reachable in both (a server going offline is never counted as removals). Earlier totals exclude removals. Most removals arrive as full toolset replacements rather than single-tool deletions, and the ledger labels them so. Removal entries are historical observations - a same-named tool may have since returned.</li>
        </ul>
      </section>

      <Figure id="drift-network-loop">{renderDiagram('drift-network-loop')}</Figure>
      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Four-state verdict
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          The directive an agent reads is one of three decisions, on top of a
          status that says how the eval went. Together they are four states an
          agent must distinguish.
        </p>
        <ul className="rule-t mt-6">
          <Dim
            label="ALLOW"
            kind="decision (roadmap)"
            body="The eval ran end-to-end and the tool cleared its checks at the recorded clearance level; the agent may invoke within that clearance until expires_at. Not produced at v1: a clearing ALLOW requires the behavioral conformance probe, gated to the D3 labeled-corpus milestone. Today the screen emits REVIEW or UNVERIFIED only."
          />
          <Dim
            label="DENY"
            kind="decision (roadmap)"
            body="The eval ran end-to-end and a finding crossed the deny threshold (high-severity intent flag, conformance regression, or a poisoned description); the agent should not invoke. Reserved in the contract; at v1 a high-severity finding surfaces as REVIEW for human adjudication rather than an automatic public DENY."
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

      <Figure id="two-verdict-surfaces">{renderDiagram('two-verdict-surfaces')}</Figure>
      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Honest limits (v1)
        </div>
        <ul className="space-y-3 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Definition, not runtime.</strong> The eval is bound to the tool definition (description + schema) at evaluation time. Runtime behavior on a specific call is not covered.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Conformance built, not yet run; monitored, not enforced.</strong> The deterministic conformance probe has not run on the public corpus, so no published screen verdict carries a conformance result today. When it runs, a conformance result is reported in the verdict and the public surface, not enforced on the wire.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">OTS cadence bound = confirmation latency.</strong> The OTS anchor proves the verdict existed by some Bitcoin block; it does not prove minute-level ordering inside the confirmation window.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">calibrated = false at v1.</strong> Confidence scores are reported but not calibrated against a held-out adversarial corpus yet.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">Advisory, not blocking.</strong> mcpindex publishes the verdict. The agent or IDE decides whether to act.</li>
          <li><span className="text-[var(--color-accent-strong)] font-mono">·</span> <strong className="text-[var(--color-ink)] font-medium">D3 graduation gate.</strong> &gt;={D3_REQUIRED_LABELS} conforming labels with FP upper-95 &lt;=2%. Current: {D3_PROGRESS}.</li>
        </ul>
        <p className="mt-6 text-[14px] text-[var(--color-cite)] leading-[1.6]">
          The honest-limits list is a contract. If any of these stops being
          true, the methodology page changes first, the verdict surface
          changes second, and the network only sees the upgrade after both.
        </p>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Quality score (directory axis)
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
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
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            lib/quality.ts
          </a>
          .
        </p>
        <p className="mt-4 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          One correction the score applies: when the{' '}
          <a
            href="/research/source-liveness"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            source-liveness census
          </a>{' '}
          has corroborated that a listing&rsquo;s repository is no longer publicly
          reachable, that listing earns no repository-derived credit in the
          completeness and documentation dimensions. A repository a reader cannot
          open is not documentation they can use. Installability and freshness are
          deliberately untouched: an unreachable repository does not make a remote
          server uninstallable, because for a remote entry the endpoint was never the
          repository. The census is negative-only evidence, so it can withhold credit
          and can never add any &mdash; an absent flag is not a clean bill of health.
        </p>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Cite this
        </div>
        <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
          <code>{`"mcpindex: the in-path trust gate for agent tool calls." mcpindex.ai/methodology, 2026.
https://mcpindex.ai/methodology`}</code>
        </pre>
        <p className="mt-4 text-[13.5px] text-[var(--color-cite)]">
          Or just{' '}
          <Link href="/leaderboard" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
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
    <li className="rule-b row-3up py-5 px-2">
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
