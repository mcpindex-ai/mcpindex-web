import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About',
  description: 'An analysis of agent-native discovery for the Model Context Protocol, with a working prototype as a live appendix. Independent research; unaffiliated with Anthropic.',
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
        §01&nbsp;&nbsp;About
      </div>
      <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
        An analysis of agent-native discovery for MCP.
      </h1>
      <p className="mt-5 max-w-[640px] text-[16px] leading-[1.6] text-[--color-cite]">
        A long-form essay with a live working prototype as the appendix. The writing
        examines where MCP server discovery is headed; the prototype demonstrates one
        possible answer.
      </p>

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
          is the canonical source of truth for MCP servers. Other directories &mdash;
          PulseMCP, Smithery, Glama, MCP.so &mdash; offer human-browsable views on top of
          it. mcpindex.ai explores the other view: machine-first, agent-callable,
          recommendation-shaped.
        </p>
        <p>
          The thesis: as IDEs and agents add MCP server discovery to their UX, somebody
          becomes the API the IDE calls when a user types <span className="inline-code">/add mcp postgres</span>.
          The registry is the data source. mcpindex.ai is one argument for what the
          recommendation surface on top of it could look like &mdash; quality-scored,
          semantically searchable, and shaped to be callable from inside an agent loop.
        </p>
        <p>
          Three primitives are exposed as part of the demonstration:{' '}
          <Link href="/llms.txt" className="text-[--color-cite] underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            an agent-readable index
          </Link>
          , a{' '}
          <Link href="/api/v1/recommend?task=postgres" className="text-[--color-cite] underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            recommendation API
          </Link>
          , and a drop-in MCP server. The full architecture and integration patterns are
          documented in <Link href="/docs" className="text-[--color-cite] underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">/docs</Link>;
          the open scoring methodology is at{' '}
          <Link href="/methodology" className="text-[--color-cite] underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            /methodology
          </Link>
          .
        </p>
      </div>

      <section className="mt-16 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute] mb-4">
          §02&nbsp;&nbsp;Author
        </div>
        <h2 className="text-[22px] tracking-tight font-medium text-[--color-ink]">
          Gautam Bharti
        </h2>
        <p className="mt-3 text-[15px] leading-[1.6] text-[--color-cite]">
          Writes about agent infrastructure, platform design, and the MCP ecosystem.
          More analysis and research at{' '}
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
          mcpindex.ai is a personal research artifact, not a commercial product or
          service offering. It is independent and unaffiliated with Anthropic. The Model
          Context Protocol is open under MIT and trademarks remain with their owners.
          Server data comes from the official MCP registry; quality scoring and semantic
          ranking are generated locally from public fields only.
        </p>
      </section>
    </article>
  );
}
