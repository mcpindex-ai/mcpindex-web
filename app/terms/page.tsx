import type { Metadata } from 'next';
import { ObfuscatedEmail } from '@/components/ObfuscatedEmail';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Terms',
  description:
    'mcpindex.ai terms of use for the in-path MCP trust gate, advisory screen, server index, and recommendation API. Free subject to the rate limit at /docs.',
  path: '/terms',
  image: '/opengraph-image',
});

export default function TermsPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Terms of use
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Terms.
      </h1>
      <p className="mt-2 font-mono text-[11.5px] text-[var(--color-mute)]">
        Last updated: 2026-08-08
      </p>

      <div className="mt-10 space-y-6 text-[14.5px] leading-[1.65] text-[var(--color-cite)]">
        <p>
          mcpindex.ai (&quot;the site&quot;) provides an in-path trust gate for Model Context
          Protocol (MCP) tool calls (pin contracts, HOLD on silent drift), plus an advisory
          screen, an index of public MCP servers, and a recommendation API on top of that
          index. Use is free subject to the rate limit published at{' '}
          <a href="/docs" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">/docs</a>.
        </p>
        <p>
          Server metadata is sourced from{' '}
          <a
            href="https://registry.modelcontextprotocol.io"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            registry.modelcontextprotocol.io
          </a>{' '}
          and shown as-is. Inclusion is not endorsement; the MCP Quality Score is a
          public-data heuristic and not a warranty of safety or reliability. You install
          third-party MCP servers at your own risk.
        </p>
        <h2 className="pt-4 text-[15.5px] font-medium text-[var(--color-ink)]">
          Using the data
        </h2>
        <p>
          Three different things are published here under three different terms. The
          distinction matters, because we do not own all of it.
        </p>
        <p>
          <strong className="font-medium text-[var(--color-ink)]">Registry metadata</strong> —
          server names, descriptions, versions, and install details mirrored from{' '}
          <a
            href="https://registry.modelcontextprotocol.io"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            registry.modelcontextprotocol.io
          </a>
          . This is upstream public data. We claim no rights over it and grant none; go to
          the registry for it.
        </p>
        <p>
          <strong className="font-medium text-[var(--color-ink)]">Published research
          datasets</strong> — the drift and screening datasets deposited on Zenodo, released
          under CC BY 4.0. Reuse them commercially or otherwise, with attribution, under
          that licence. Nothing on this page narrows it.
        </p>
        <p>
          <strong className="font-medium text-[var(--color-ink)]">The judgment layer</strong>{' '}
          — screen verdicts, MCP Quality Scores, the drift ledger, and source-liveness
          evidence. This is our own work: observations we made and records we kept, not a
          mirror of anyone else. It is &copy; Bhartis LLC and provided for noncommercial use
          with attribution. Querying it through the documented API, citing it, and linking
          to it are all fine and encouraged. Bulk extraction to reconstruct or resell the
          dataset is not. Email{' '}
          <ObfuscatedEmail
            user="hello"
            domain="mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          />{' '}
          for a commercial or redistribution licence.
        </p>
        <p>
          These terms are also published machine-readably at{' '}
          <a
            href="/.well-known/mcp-index.json"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            /.well-known/mcp-index.json
          </a>
          , so an agent can read them without parsing this page.
        </p>
        <p>
          The site is provided &quot;as is&quot; without warranties of any kind. Maximum
          aggregate liability is limited to fees paid in the 12 months preceding the claim
          (which on the free tier is zero).
        </p>
        <p>
          Excessive use that disrupts service for others may be rate-limited, blocked, or
          throttled without notice. Email{' '}
          <ObfuscatedEmail
            user="hello"
            domain="mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          />{' '}
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
