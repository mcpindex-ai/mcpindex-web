import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms',
  description: 'Terms of use for mcpindex.ai.',
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-[720px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
        §01&nbsp;&nbsp;Terms of use
      </div>
      <h1 className="mt-3 text-[36px] sm:text-[44px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
        Terms.
      </h1>
      <p className="mt-2 font-mono text-[11.5px] text-[--color-mute]">
        Last updated: 2026-04-30
      </p>

      <div className="mt-10 space-y-6 text-[14.5px] leading-[1.65] text-[--color-cite]">
        <p>
          mcpindex.ai (&quot;the site&quot;) provides an index of public Model Context
          Protocol (MCP) servers and a recommendation API on top of that index. Use is
          free for the public tier subject to the rate limit published at{' '}
          <a href="/pricing" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">/pricing</a>.
        </p>
        <p>
          Server metadata is sourced from{' '}
          <a
            href="https://registry.modelcontextprotocol.io"
            className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]"
          >
            registry.modelcontextprotocol.io
          </a>{' '}
          and shown as-is. Inclusion is not endorsement; the MCP Quality Score is a
          public-data heuristic and not a warranty of safety or reliability. You install
          third-party MCP servers at your own risk.
        </p>
        <p>
          The site is provided &quot;as is&quot; without warranties of any kind. Maximum
          aggregate liability is limited to fees paid in the 12 months preceding the claim
          (which on the free tier is zero).
        </p>
        <p>
          Excessive use that disrupts service for others may be rate-limited, blocked, or
          throttled without notice. Email{' '}
          <a href="mailto:hello@mcpindex.ai" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            hello@mcpindex.ai
          </a>{' '}
          if you need higher limits.
        </p>
        <p>
          mcpindex.ai is unofficial and not affiliated with Anthropic. &quot;MCP&quot; and
          &quot;Model Context Protocol&quot; are referenced descriptively under nominative
          fair use; trademarks remain with their respective owners.
        </p>
      </div>
    </article>
  );
}
