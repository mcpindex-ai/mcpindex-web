import Link from 'next/link';
import type { Metadata } from 'next';
import { ProvenanceBadge } from '@/components/ProvenanceBadge';
import { Seal } from '@/components/Seal';

export const metadata: Metadata = {
  title: 'Trust',
  description:
    'How mcpindex earns trust: how a verdict is produced, Bitcoin-anchored provenance, the security and data model, compliance posture and roadmap, and live status. Honest about the edges.',
};

// The promoted trust surface (Vercel/Linear "/security" analog). A concise hub
// that states the trust model plainly and routes to the deep method, status,
// and contact. Pre-SOC2 and honest about it - silence on compliance reads as
// hiding; a stated posture + roadmap reads as serious.
export default function TrustPage() {
  return (
    <article className="mx-auto max-w-[820px] px-6 sm:px-10 pt-16 pb-24">
      <div className="flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        <Seal size={22} ring="var(--color-rule)" bracket="var(--color-mute)" />
        Trust
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Trust, stated plainly.
      </h1>
      <p className="mt-5 max-w-[680px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        mcpindex is the layer an agent consults before it acts on a tool. A
        trust product has to earn the word: by being legible about how it
        works, what it anchors, and exactly where it stops. This page is that
        account.
      </p>
      <div className="mt-6">
        <ProvenanceBadge />
      </div>

      <Section label="How a verdict is produced">
        <p>
          Every verdict comes from a hybrid evaluation: a deterministic
          conformance probe (does observed behavior match the declared schema)
          and an adversarial LLM judge (does the description hide instructions,
          exfiltration, or overclaims). The output is a per-tool decision -
          ALLOW, DENY, or REVIEW - with dimension verdicts and severity.
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
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            OpenTimestamps
          </a>
          . Once a block confirms, the trust record for a tool cannot be quietly
          rewritten. The claim is precise: anchored history exists. It is not a
          claim about minute-level ordering inside the confirmation window - see
          the honest limits below.
        </p>
      </Section>

      <Section label="Security & data model">
        <ul className="space-y-3">
          <Edge head="Advisory, not blocking (the directory screen).">
            The directory screen publishes a verdict; your agent or IDE decides
            whether to act. The screen does not sit in your call path or proxy
            your traffic. The in-path drift gate (below) is the separate surface
            that can HOLD a call.
          </Edge>
          <Edge head="Public artifacts in.">
            Verdicts are produced from public tool definitions (description +
            schema) and live probes. The screener evaluates the text you paste -
            do not paste real secrets into it.
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
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
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
          before your agent acts, so it can HOLD the call &mdash; not just alert
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
            second connection &mdash; structurally, not as a promise.
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

      <Section label="Compliance & roadmap">
        <p>
          Direct and current: mcpindex is pre-SOC 2. We are not going to imply
          otherwise. The interim posture is the one above - advisory deployment,
          no call-time data, public method, Bitcoin-anchored history. Formal
          attestation (SOC 2 Type 2) is on the roadmap when enterprise demand
          warrants the audit, not before. If you have a specific compliance
          requirement,{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
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
          conformance is monitored, not enforced; confidences are reported but
          not yet calibrated (calibrated=false at v1); coverage rolls out as the
          corpus expands (15 of 150 labels to graduation, adversarial cases
          first). The full contract lives on{' '}
          <TLink href="/methodology">/methodology</TLink> - and it changes there
          first, before the verdict surface does.
        </p>
      </Section>

      <Section label="Status & contact">
        <p>
          Live system status, data freshness, and the incident log are at{' '}
          <TLink href="/status">/status</TLink>. To report a problem with a
          verdict or a security concern, email{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
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
      <div className="max-w-[680px] text-[15px] leading-[1.65] text-[var(--color-cite)]">
        {children}
      </div>
    </section>
  );
}

function Edge({ head, children }: { head: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="text-[var(--color-accent)] font-mono">·</span>{' '}
      <strong className="text-[var(--color-ink)] font-medium">{head}</strong>{' '}
      {children}
    </li>
  );
}

function TLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
    >
      {children}
    </Link>
  );
}
