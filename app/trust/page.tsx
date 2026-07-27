import Link from 'next/link';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { PriorityGuides } from '@/components/PriorityGuides';
import { Seal } from '@/components/Seal';
import { D3_CONFORMING_LABELS, D3_REQUIRED_LABELS } from '@/lib/honest-limits';

export const metadata: Metadata = pageMetadata({
  title: 'Trust',
  description:
    'How mcpindex earns trust: how a verdict is produced, Bitcoin-anchored provenance, the security and data model, compliance posture and roadmap, and live status. Honest about the edges.',
  path: '/trust',
});

// The promoted trust surface (Vercel/Linear "/security" analog). A concise hub
// that states the trust model plainly and routes to the deep method, status,
// and contact. Pre-SOC2 and honest about it - silence on compliance reads as
// hiding; a stated posture + roadmap reads as serious.
export default function TrustPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        <Seal size={22} ring="var(--color-rule)" bracket="var(--color-mute)" />
        Trust
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Trust, stated plainly.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        mcpindex is the in-path trust gate an agent (or host) runs before a tool call
        executes - pin the contract, HOLD on silent drift - plus an advisory directory
        screen for what you wire. A trust product has to earn the word: by being legible
        about how it works, what it anchors, and exactly where it stops. This page is that
        account.
      </p>
      <div className="mt-6">
        <ProvenanceBadge />
      </div>

      <PriorityGuides
        className="mt-10"
        kicker="Practical guides"
        intro="How to decide whether to connect a server, how to screen it, and what a silent contract change looks like in the wild."
      />

      <Section label="How a verdict is produced">
        <p>
          Every published screen verdict is semantic: an adversarial LLM judge
          reads the description for hidden instructions, exfiltration, or
          overclaims, bound to the exact tool definition seen. The screener runs
          on a recurring schedule, prioritizing new or requested servers;
          coverage expands across the registry as the corpus grows. The
          output is a per-tool REVIEW or UNVERIFIED with dimension verdicts and
          severity. The deterministic conformance probe (does observed behavior
          match the declared schema) is built but has not run on the public
          corpus; no published verdict carries a conformance result, and a
          clearing ALLOW - which the probe would have to earn - is
          not produced at v1.
        </p>
        <p className="mt-4">
          The full method, the four-state model, and the graduation gate are
          documented in{' '}
          <TLink href="/methodology">/methodology</TLink>. It is written to be
          checked, not taken on faith.
        </p>
      </Section>

      <Section label="Provenance">
        <p>
          Verdict history is hash-chained and timestamped to Bitcoin via{' '}
          <a
            href="https://opentimestamps.org"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            OpenTimestamps
          </a>
          . Once a block confirms, the trust record for a tool cannot be quietly
          rewritten. The claim is precise: anchored history exists. It is not a
          claim about minute-level ordering inside the confirmation window - see
          the honest limits below.
        </p>
      </Section>

      <Figure id="trust-boundary">{renderDiagram('trust-boundary')}</Figure>
      <Section label="Security & data model">
        <ul className="space-y-3">
          <Edge head="Advisory, not blocking (the directory screen).">
            The directory screen publishes a verdict; your agent or IDE decides
            whether to act. The screen does not sit in your call path or proxy
            your traffic. The in-path drift gate (below) is the separate surface
            that can HOLD a call.
          </Edge>
          <Edge head="Public artifacts in.">
            Verdicts are produced from public tool definitions (the description +
            schema). The screener evaluates the text you paste - do not paste real
            secrets into it.
          </Edge>
          <Edge head="No call-time data.">
            We evaluate the tool definition, not your runtime calls. Your
            arguments and your data never reach us.
          </Edge>
          <Edge head="Open by default.">
            Methodology, quality scoring, and the registry source are public on{' '}
            <a
              href="https://github.com/mcpindex-ai/mcpindex-web"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              GitHub
            </a>
            . What we assert, you can audit.
          </Edge>
        </ul>
      </Section>

      <Section label="The drift gate's posture">
        <p>
          The screen above is advisory and out of the call path. The drift gate
          is different in one decisive way: it is in-path. It pins each MCP
          tool&rsquo;s contract on first sight and checks the live contract
          before your agent acts, so it can HOLD the call - not just alert
          after the fact, the way a passive scanner does. That position is what
          lets it protect a running agent; it is also what makes its trust
          posture worth stating exactly.
        </p>
        <ul className="mt-4 space-y-3">
          <Edge head="Zero credential custody.">
            The gate never receives your tokens. It observes the session your
            client already authenticated and reads only the public tool contracts;
            the one-click wiring passes a server&rsquo;s original env / headers
            through to that server untouched. There is no token field and no
            second connection - structurally, not as a promise.
          </Edge>
          <Edge head="Contract-diff, not a safety verdict.">
            A HOLD means the tool&rsquo;s contract changed versus what you pinned,
            not that the new contract is unsafe. The gate asserts what changed; you
            review and re-pin if it is expected.
          </Edge>
          <Edge head="Fail-closed.">
            A tool with no pin, an unreadable contract, or a diff the gate cannot
            complete HOLDs rather than proceeds. The gate never renders a silent
            ALLOW on something it could not verify.
          </Edge>
          <Edge head="Advisory in judgment, in-path in effect.">
            The judgment is narrow and provable (a deterministic contract-diff);
            the effect is real because the gate sits in the call path. We do not
            claim it verifies safety, blocks attacks, or certifies a tool.
          </Edge>
        </ul>
      </Section>

      <Section label="Deployment & threat model">
        <p>
          What a security reviewer needs in one place: where the gate runs, what
          leaves the machine, and which threats it does and does not address.
        </p>
        <ul className="mt-4 space-y-3">
          <Edge head="Where it runs.">
            In-path on the developer / agent host, single-tenant by default. The
            multi-tenant gateway (logical, in-process isolation, posture, and
            audit) is built but held off by default behind an explicit flag;
            spoof-resistant identity and process/VM separation are roadmap, and it
            is not the default deployment.
          </Edge>
          <Edge head="What leaves by default: nothing.">
            The deterministic tier-0 contract-diff runs locally; the default build
            egresses nothing and never holds your credentials. Tiers 1-3 (cloud
            corpus lookup, LLM consult, behavioral verifier) are built in-path
            seams, each held off by default and gated behind explicit opt-in.
          </Edge>
          <Edge head="Optional egress: the cloud corpus lookup.">
            If you opt into the cloud tier-1 corpus lookup, the only thing that
            leaves is a contract hash (a deterministic hash over the public tool
            contract) plus your bearer key on the pinned transport - never a
            token, an argument, a schema body, or your call data. Any error
            degrades to a miss (fail-closed). That request lands on mcpindex&rsquo;s
            US-region edge.
          </Edge>
          <Edge head="Optional egress: the drift network.">
            If you opt into drift telemetry (<code className="font-mono">MCPINDEX_DRIFT_TELEMETRY=detection</code>,
            off by default), the gate emits one one-way signal on a pin or a drift - salted
            (HMAC) fingerprints of the server/tool id, the contract hashes, the change type, a
            safety flag, an hour-rounded time, a random install id, and the SDK tag - and
            queries the network so it can warn you on the first call. Never a schema, argument,
            description, URL, or server/tool name. Fail-open: it never blocks or changes a call.
            Full disclosure on{' '}
            <Link href="/privacy" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">privacy</Link>.
          </Edge>
          <Edge head="Sub-processors.">
            None in the default local deployment - nothing leaves the host,
            so there is nothing to sub-process. If you opt into the cloud tier-1
            lookup, the request lands on our US-region edge (Vercel) and no other
            sub-processor sees it. A current sub-processor list is available on
            request.
          </Edge>
          <Edge head="Supply-chain integrity.">
            The <code className="font-mono">install.sh</code> /{' '}
            <code className="font-mono">install.ps1</code> installer and the
            published wheel ship with a SHA-256 you can verify before you run them,
            and the installer is auditable by piping it to{' '}
            <code className="font-mono">less</code> first. A signed single-binary
            (SLSA provenance) is on the roadmap; until then, pin the checksum.
          </Edge>
          <Edge head="Threats addressed.">
            Silent contract drift (a tool changing its contract after you pinned
            it), description-poisoning (hidden instructions in a tool description),
            and an injection / exfil marker planted in an input or output schema.
          </Edge>
          <Edge head="Threats NOT addressed.">
            The gate does not prove a tool safe, block or prevent an attack, or
            catch malicious runtime behavior that stays within an unchanged
            contract. It reports what changed; you decide.
          </Edge>
        </ul>
      </Section>

      <Figure id="tier-ladder">{renderDiagram('tier-ladder')}</Figure>
      <Figure id="provenance-chain">{renderDiagram('provenance-chain')}</Figure>
      <Section label="Compliance & roadmap">
        <p>
          Direct and current: mcpindex is pre-SOC 2. We are not going to imply
          otherwise. The interim posture is the one above - advisory deployment,
          no call-time data, public method, Bitcoin-anchored history. Formal
          attestation (SOC 2 Type 2) is on the roadmap, not something we claim
          today. If you have a specific compliance
          requirement,{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            tell us what you need
          </a>{' '}
          and we will answer honestly about where we are.
        </p>
        <p className="mt-4 text-[13.5px] text-[var(--color-mute)]">
          Data handling is described in our{' '}
          <TLink href="/privacy">privacy policy</TLink>.
        </p>
      </Section>

      <Section label="Honest limits">
        <p>
          A trust product earns trust by stating its edges, on every verdict:
          the screen is semantic (the conformance probe is built but has not run
          on the public corpus; when it runs it is monitored, not enforced);
          confidences are reported but not yet calibrated (calibrated=false at
          v1); coverage expands continuously as the backfill scanner runs
          ({D3_CONFORMING_LABELS} of {D3_REQUIRED_LABELS} labels to graduation, adversarial cases
          first). The full contract lives on{' '}
          <TLink href="/methodology">/methodology</TLink> - and it changes there
          first, before the verdict surface does.
        </p>
      </Section>

      <Section label="Security disclosure">
        <p>
          Report a vulnerability to{' '}
          <a
            href="mailto:security@mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            security@mcpindex.ai
          </a>{' '}
          (or{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            hello@mcpindex.ai
          </a>
          ). We acknowledge within two business days and aim to ship a fix or a
          mitigation timeline within ten. Please give us a reasonable window
          before public disclosure. A <code className="font-mono">SECURITY.md</code>{' '}
          with the same policy and a PGP key is published in the repo.
        </p>
      </Section>

      <Section label="Status & contact">
        <p>
          Live system status, data freshness, and the incident log are at{' '}
          <TLink href="/status">/status</TLink>. To report a problem with a
          verdict, email{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            hello@mcpindex.ai
          </a>
          .
        </p>
      </Section>
    </article>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 rule-t pt-10">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        {label}
      </div>
      <div className=" text-[15px] leading-[1.65] text-[var(--color-cite)]">
        {children}
      </div>
    </section>
  );
}

function Edge({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
      <strong className="text-[var(--color-ink)] font-medium">{head}</strong>{' '}
      {children}
    </li>
  );
}

function TLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
    >
      {children}
    </Link>
  );
}
