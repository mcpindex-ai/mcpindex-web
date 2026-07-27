import Link from 'next/link';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Which mcpindex? Disambiguation',
  description:
    'mcpindex.ai (this site) is the in-path trust gate and drift ledger for MCP tool calls. Other projects share a similar name; here is how to tell them apart.',
  path: '/which-mcpindex',
  image: '/opengraph-image',
});

// Brand-SERP disambiguation: linked from the Show HN FAQ and available for anyone
// who lands on a similarly-named listing elsewhere. Factual, respectful, no shade.
export default function WhichMcpindexPage() {
  return (
    <article className="site-container pt-16 pb-24 max-w-3xl">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Disambiguation
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
          Which mcpindex is this?
        </h1>
      </header>

      <div className="mt-8 space-y-5 text-[15.5px] leading-[1.6] text-[var(--color-cite)]">
        <p>
          <strong className="text-[var(--color-ink)]">This site - mcpindex.ai</strong> - is the
          in-path trust gate and public drift ledger for MCP tool calls: it pins each tool&rsquo;s
          contract when your agent first sees it, holds the call when that contract silently
          changes, and publishes contract-change observations from a daily crawl of the reachable
          MCP registry at{' '}
          <Link href="/ledger" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            /ledger
          </Link>
          . The gate installs as the PyPI package{' '}
          <code className="font-mono text-[13.5px] text-[var(--color-ink)]">mcpindex-gate</code>;
          the directory client is the npm package{' '}
          <code className="font-mono text-[13.5px] text-[var(--color-ink)]">mcp-server-mcpindex</code>{' '}
          (registry name <code className="font-mono text-[13.5px] text-[var(--color-ink)]">io.github.gautamgb/mcp-server-mcpindex</code>),
          and the SDKs live under the npm scope{' '}
          <code className="font-mono text-[13.5px] text-[var(--color-ink)]">@mcp-index</code>. The
          GitHub org is{' '}
          <a href="https://github.com/mcpindex-ai" target="_blank" rel="noreferrer" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]">
            github.com/mcpindex-ai
          </a>
          .
        </p>
        <p>
          <strong className="text-[var(--color-ink)]">Other projects share a similar name.</strong>{' '}
          At least one separate, unaffiliated tool called &ldquo;MCPIndex&rdquo; (a tool-discovery
          MCP server by a different author) appears on directory sites such as mcp.so and
          PulseMCP. It is not this project, not this codebase, and not maintained by us - and
          nothing here should be read as a comment on its quality. If you found a listing and
          are unsure which project it refers to, check whether it points at mcpindex.ai or
          github.com/mcpindex-ai.
        </p>
        <p>
          <strong className="text-[var(--color-ink)]">Neither project is affiliated with
          Anthropic</strong> or the Model Context Protocol maintainers. mcpindex.ai indexes the
          public, Anthropic-maintained registry and says so on every page that uses its data.
        </p>
      </div>

      <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Questions:{' '}
        <a href="mailto:hello@mcpindex.ai" className="hover:text-[var(--color-accent-strong)]">
          hello@mcpindex.ai
        </a>
      </p>
      <Figure id="two-jobs-two-packages">{renderDiagram('two-jobs-two-packages')}</Figure>
    </article>
  );
}
