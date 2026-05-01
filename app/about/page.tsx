import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'mcpindex.ai is an unofficial agent-native discovery layer for MCP servers, built by Gautam Bharti.',
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
        §01&nbsp;&nbsp;About
      </div>
      <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
        Built so an agent can find the right MCP server at inference time.
      </h1>

      <div className="mt-10 space-y-6 text-[15.5px] leading-[1.65] text-[--color-cite]">
        <p>
          The official MCP registry at{' '}
          <a
            href="https://registry.modelcontextprotocol.io"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]"
          >
            registry.modelcontextprotocol.io
          </a>{' '}
          is the canonical source of truth for MCP servers. Other directories — PulseMCP,
          Smithery, Glama, MCP.so — built human-browsable views on top of it. mcpindex.ai
          builds the other view: machine-first, agent-callable, recommendation-shaped.
        </p>
        <p>
          The thesis: as IDEs and agents add MCP server discovery to their UX, somebody
          becomes the API the IDE calls when a user types <span className="inline-code">/add mcp postgres</span>.
          Anthropic&apos;s registry is the data source. mcpindex.ai is the polish layer —
          quality-scored, semantically searchable, and shipped as an MCP server itself so any
          client can install it and discover other MCP servers from inside an agent loop.
        </p>
        <p>
          Three primitives:{' '}
          <Link href="/llms.txt" className="text-[--color-cite] underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            agent-readable index
          </Link>
          ,{' '}
          <Link href="/api/v1/recommend?task=postgres" className="text-[--color-cite] underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            recommendation API
          </Link>
          , and a drop-in MCP server (<span className="inline-code">npm install -g mcp-server-mcpindex</span>).
        </p>
      </div>

      <section className="mt-16 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
          §02&nbsp;&nbsp;Founder
        </div>
        <h2 className="text-[22px] tracking-tight font-medium text-[--color-ink]">
          Gautam Bharti
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6] text-[--color-cite]">
          Product manager focused on agent infrastructure. Also runs{' '}
          <a
            href="https://seekgb.com"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]"
          >
            seekgb.com
          </a>
          .{' '}
          <a
            href="https://www.linkedin.com/in/gautambharti"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]"
          >
            LinkedIn
          </a>
          {' · '}
          <a href="mailto:hello@mcpindex.ai" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            hello@mcpindex.ai
          </a>
        </p>
      </section>

      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
          §03&nbsp;&nbsp;Affiliation
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[--color-cite]">
          mcpindex.ai is unofficial and not affiliated with Anthropic. The Model Context
          Protocol is open under MIT and trademarks remain with their owners. Server data
          comes from the official MCP registry; quality scoring and semantic ranking are
          generated locally from public fields only.
        </p>
      </section>
    </article>
  );
}
