import type { Metadata } from 'next';
import Link from 'next/link';
import { ScreenDemo } from '@/components/ScreenDemo';

export const metadata: Metadata = {
  title: 'Screen an MCP tool',
  description:
    'Paste an MCP tool description and an LLM judge flags hidden instructions - the kind that tell an agent to read a secret file, exfiltrate data, or follow a buried command. Advisory, semantic-only, published as-is. Not a certification.',
  alternates: { canonical: 'https://mcpindex.ai/screen' },
};

const UNDERLINE =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]';

export default function ScreenPage() {
  return (
    <article className="mx-auto max-w-[920px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Screen
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Screen an MCP tool.
      </h1>
      <p className="mt-4 max-w-[680px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Paste a tool description. An LLM judge reads it for hidden instructions -
        the kind that tell an agent to read a secret file, exfiltrate data, or
        follow a buried command - and flags the exact line.
      </p>
      <p className="mt-3 max-w-[680px] text-[15px] leading-[1.6] text-[var(--color-cite)]">
        <strong className="text-[var(--color-ink)]">Building an MCP server?</strong>{' '}
        Run yours through it and see the verdict your users would see before
        their agent calls your tool. Same screen, same output, whether you own
        the tool or are deciding whether to trust it.
      </p>

      <div className="mt-8 max-w-[800px]">
        <ScreenDemo />
      </div>

      {/* Guardrail: foreclose the "certification / badge" reading in the product itself. */}
      <section className="mt-12 rule-t pt-8 max-w-[720px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-5">
          What this is - and isn&apos;t
        </div>
        <ul className="space-y-4 text-[14px] leading-[1.6] text-[var(--color-cite)]">
          <li>
            <strong className="text-[var(--color-ink)]">Advisory and semantic-only.</strong> We read
            the description, not the running tool. The deterministic conformance probe is in build;
            until it ships, findings are labeled PARTIAL.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">A pass is not a safety guarantee.</strong> It
            means the description isn&apos;t lying - not that the tool is safe to grant access to. A
            high-capability tool with an honest description still warrants caution.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Not a certification or a badge.</strong>{' '}
            Screening your own tool does not get it endorsed, listed, or ranked higher. We publish
            what the judge finds, including DENY, and the verdict is the same one a user evaluating
            your tool would get. We screen tools; we don&apos;t sell them a verdict.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Your input isn&apos;t stored</strong> unless
            you check &ldquo;Contribute this example.&rdquo; See{' '}
            <Link href="/privacy" className={UNDERLINE}>privacy</Link> and{' '}
            <Link href="/methodology" className={UNDERLINE}>how a finding is produced</Link>.
          </li>
        </ul>
      </section>
    </article>
  );
}
