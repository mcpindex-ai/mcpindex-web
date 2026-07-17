import type { Metadata } from 'next';
import Link from 'next/link';
import { ScanTool } from '@/components/ScanTool';
import { jsonLdSafe } from '@/lib/jsonLd';

export const metadata: Metadata = {
  title: 'Scan your MCP setup - blast radius in your browser',
  description:
    'Paste your mcp.json and see what your agent can actually do: which tools can take irreversible actions, which send data off your machine, and how many contracts are unpinned and free to drift. Runs entirely in your browser. Nothing is uploaded.',
  alternates: { canonical: 'https://mcpindex.ai/scan' },
};

const UNDERLINE =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]';

// Service JSON-LD so LLM answers + search can surface the free tool. Typed as
// Service (not SoftwareApplication) because it is an in-browser tool with nothing
// to install or download, and to stay out of Google's app rich-result program,
// which requires a user rating we cannot honestly supply.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  name: 'mcpindex scan',
  serviceType: 'MCP configuration blast-radius scan',
  url: 'https://mcpindex.ai/scan',
  isAccessibleForFree: true,
  provider: { '@type': 'Organization', name: 'mcpindex.ai', url: 'https://mcpindex.ai' },
  description:
    'A free, in-browser tool that reads your MCP configuration and reports each tool’s blast radius: action type, side effect, reversibility, and off-machine egress. No install, no upload.',
};

export default function ScanPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <script
        type="application/ld+json"
        // One escaping path across all four JSON-LD pages (also handles >, &, U+2028/9).
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(JSON_LD) }}
      />

      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">Scan</div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">See your agent&apos;s blast radius.</h1>
      <p className="mt-4 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Paste your <code className="font-mono text-[15px]">mcp.json</code> and see what your agent can actually
        do: which tools can take irreversible actions, which send data off your machine, and how many contracts
        are <strong className="text-[var(--color-ink)]">unpinned</strong> and free to change under you.
      </p>
      <p className="mt-3 text-[15px] leading-[1.6] text-[var(--color-cite)]">
        It runs entirely in your browser. Your config is read locally and{' '}
        <strong className="text-[var(--color-ink)]">never uploaded</strong> - which matters, because that file
        holds your tokens.
      </p>

      <div className="mt-8">
        <ScanTool />
      </div>

      {/* Honesty guardrail - the same discipline as /screen. */}
      <section className="mt-12 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-5">
          What this is - and isn&apos;t
        </div>
        <ul className="space-y-4 text-[14px] leading-[1.6] text-[var(--color-cite)]">
          <li>
            <strong className="text-[var(--color-ink)]">Deterministic, not a verdict.</strong> Every label is a
            fact read off the declared contract (schema, name, annotations) - action type, side effect,
            reversibility, egress. It never says a tool is &ldquo;safe&rdquo; or &ldquo;unsafe.&rdquo;
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">It&apos;s Monday&apos;s snapshot.</strong> A scan shows
            what your tools declare right now. It does not run them, and it can&apos;t catch a live server that
            changes what it does after you look. Watching for that change over time is what the{' '}
            <Link href="/demo" className={UNDERLINE}>gate</Link> does.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Nothing leaves your browser.</strong> No upload, no
            account, no logging of your config. The share card carries counts only - never tool names or
            schemas. See <Link href="/privacy" className={UNDERLINE}>privacy</Link>.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Local servers stay coarse.</strong> A browser can&apos;t
            reach a local (stdio) server, so those show a server-level read; paste a{' '}
            <code className="font-mono">tools/list</code> dump for the full per-tool blast radius.
          </li>
        </ul>
        <p className="mt-6 text-[13px] text-[var(--color-mute)]">
          Looking to check a single tool&apos;s <em>description</em> for hidden instructions instead?{' '}
          <Link href="/screen" className={UNDERLINE}>Screen a tool →</Link>
        </p>
      </section>
    </article>
  );
}
