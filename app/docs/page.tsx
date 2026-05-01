import Link from 'next/link';
import type { Metadata } from 'next';
import { ArchDiagram } from '@/components/ArchDiagram';

export const metadata: Metadata = {
  title: 'How it works',
  description:
    'How agents call mcpindex.ai. The architecture, the three integration shapes, the wiring config for Claude Desktop, Cursor, Cline, and Zed, and the response anatomy.',
  alternates: { canonical: 'https://mcpindex.ai/docs' },
};

export const revalidate = 3600;

const FONT_MONO = '"Geist Mono", ui-monospace, monospace';

export default function DocsPage() {
  return (
    <article className="mx-auto max-w-[820px] px-6 sm:px-10 pt-16 pb-24">
      {/* §00 — Hero */}
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
          §00&nbsp;&nbsp;Documentation
        </div>
        <h1 className="mt-3 text-[40px] sm:text-[52px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
          How agents call mcpindex.ai.
        </h1>
        <p className="mt-5 max-w-[640px] text-[16px] leading-[1.6] text-[--color-cite]">
          An MCP-native API. Free, no key required, low-latency. Three integration shapes:
          direct HTTP, drop-in MCP server (recommended), or embedded into your platform.
          The whole surface fits on this page.
        </p>
      </header>

      {/* §01 — The shape */}
      <Section number="01" title="The shape">
        <p>
          Five components in the request path; a refresh job keeps the catalog current.
        </p>
        <ArchDiagram />
        <p>
          Top-down: a request originates in your agent client, passes through a
          discovery adapter into the recommendation API, ranks against an indexed
          catalog of MCP servers, and returns three ranked picks with reasoning and
          install commands. The catalog is rebuilt daily from an upstream source.
        </p>
        <p>
          What you don&rsquo;t need to care about as a caller: which storage layer
          backs the catalog, where the refresh worker runs, what compute hosts the API.
          The contract is the recommendation endpoint; everything else is internal.
        </p>
      </Section>

      {/* §02 — Three ways to use it */}
      <Section number="02" title="Three ways to use it">
        <p>Pick the shape that matches where the agent lives.</p>

        <UseCase
          letter="A"
          title="Direct HTTP API"
          who="For server-side agents, custom orchestrators, anything outside an MCP client."
          codeLines={[
            `curl "https://mcpindex.ai/api/v1/recommend?task=read+pdf+to+s3"`,
          ]}
          notes="Returns ranked picks as JSON. Same shape an MCP client gets back."
        />
        <UseCase
          letter="B"
          title="Drop-in MCP server"
          who="For Claude Desktop, Cursor, Cline, Zed. Install once, the agent finds the rest from inside the loop."
          codeLines={[`npm install -g mcp-server-mcpindex`]}
          notes="The package is a thin client to the same API. Zero config in most clients — see §03."
        />
        <UseCase
          letter="C"
          title="Embedded in your platform"
          who="For platforms (Composio, Mastra, Toolhouse, IDE plays) that want MCP discovery as a feature."
          codeLines={[
            `// Server-side, your code:`,
            `const res = await fetch("https://mcpindex.ai/api/v1/recommend?task=" +`,
            `  encodeURIComponent(userTask));`,
            `const { recommendations } = await res.json();`,
          ]}
          notes="Attribution appreciated. Email hello@mcpindex.ai if you want a higher rate limit."
        />
      </Section>

      {/* §03 — Wire it to your client */}
      <Section number="03" title="Wire it to your client">
        <p>
          The server is identical across clients. Only the config-file location and
          shape differ. Restart the client after editing.
        </p>

        <ClientConfig
          client="Claude Desktop"
          path="~/Library/Application Support/Claude/claude_desktop_config.json"
          json={`{
  "mcpServers": {
    "mcpindex": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcpindex"]
    }
  }
}`}
        />

        <ClientConfig
          client="Cursor"
          path=".cursor/mcp.json (project) or ~/.cursor/mcp.json (global)"
          json={`{
  "mcpServers": {
    "mcpindex": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcpindex"]
    }
  }
}`}
        />

        <ClientConfig
          client="Cline (VS Code)"
          path="Cline settings panel → MCP Servers → Add"
          json={`Command:  npx
Args:     -y mcp-server-mcpindex`}
        />

        <ClientConfig
          client="Zed"
          path="~/.config/zed/settings.json"
          json={`{
  "context_servers": {
    "mcpindex": {
      "command": "npx",
      "args": ["-y", "mcp-server-mcpindex"]
    }
  }
}`}
        />

        <p>
          Once installed, the four tools are available in any agent loop:{' '}
          <Mono>recommend_mcp_for_task</Mono>, <Mono>search_mcp_servers</Mono>,{' '}
          <Mono>get_install_command</Mono>, <Mono>compare_servers</Mono>. Ask your agent
          something like &ldquo;find me an MCP server that can read PDFs and write to
          S3&rdquo; and watch it call <Mono>recommend_mcp_for_task</Mono> automatically.
        </p>
      </Section>

      {/* §04 — Anatomy of a response */}
      <Section number="04" title="Anatomy of a response">
        <p>
          The recommendation endpoint returns a tight JSON envelope. Three picks ranked
          by composite score, each with reasoning, install commands per registry type,
          and the live MCP Quality Score.
        </p>
        <pre className="overflow-x-auto bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[11.5px] leading-snug">
          <code>{`{
  "task": "read pdf and save to s3",
  "recommendations": [
    {
      "rank": 1,                                  // composite-rank position (1-3)
      "slug": "io-github-foo-pdf-mcp",            // url-safe ident, used in the per-server page
      "name": "io.github.foo/pdf-mcp",            // canonical registry name
      "title": "PDF Tools MCP Server",            // display name
      "description": "Generate PDF from HTML…",   // one-line description from the registry
      "category": "docs",                         // inferred category (28 total)
      "qualityScore": 95,                         // 0-100, see /methodology
      "reasoning": "Matches \\"pdf\\" in docs-category server.",  // why it ranked
      "installs": {
        "npm": "@foo/pdf-mcp",                    // present if registry has an npm package
        "pypi": null,
        "docker": null,
        "remote": null                            // present if registry has a remote URL
      },
      "url": "https://mcpindex.ai/server/io-github-foo-pdf-mcp"
    },
    /* … 2 more ranked picks … */
  ],
  "note": "v0 ranker — heuristic score blends keyword match (70%) with MCP Quality Score (30%). See /methodology."
}`}</code>
        </pre>
      </Section>

      {/* §05 — Limits + guarantees */}
      <Section number="05" title="Limits + guarantees">
        <ul className="space-y-3">
          <Limit
            label="Rate"
            body="60 requests / minute / IP on the free tier. No key required. 429 with Retry-After when exceeded. Email hello@mcpindex.ai for higher limits or for a Pro key."
          />
          <Limit
            label="Schema stability"
            body={
              <>
                <Mono>/api/v1/*</Mono> is versioned. Breaking changes ship behind{' '}
                <Mono>/api/v2</Mono>; v1 stays available for at least 6 months after v2
                lands. Field additions are not breaking and ship to v1.
              </>
            }
          />
          <Limit
            label="Cache"
            body="Responses are cached at the edge with stale-while-revalidate fallback. Repeat queries within minutes are essentially free; the first call after a cache miss adds modest latency."
          />
          <Limit
            label="Fallback"
            body={
              <>
                If the API is unreachable, fall back to <Mono>/llms.txt</Mono> and{' '}
                <Mono>/llms-full.txt</Mono> for static reference data. The MCP server
                package surfaces a clear error to the agent rather than fabricating
                results.
              </>
            }
          />
          <Limit
            label="Data freshness"
            body="Catalog rebuilt nightly. Integrity checks reject obviously partial refreshes before they go live. Worst-case staleness: 24 hours."
          />
          <Limit
            label="Authentication"
            body="None on free tier — public endpoints. CORS open. Pro tier (when ramped) uses bearer tokens; existing free endpoints stay open."
          />
        </ul>
      </Section>

      {/* §06 — How this compares */}
      <Section number="06" title="How this compares">
        <p>
          Five common ways an agent (or developer) finds an MCP server today. mcpindex.ai
          is the only one that hits all four traits an agent at inference time actually
          needs.
        </p>

        <div className="mt-4 -mx-2 sm:mx-0 overflow-x-auto">
          <table
            className="w-full min-w-[640px] border-collapse text-[13.5px]"
            style={{ color: 'var(--color-cite)' }}
          >
            <thead>
              <tr
                className="text-left"
                style={{ borderBottom: '1px solid var(--color-rule)' }}
              >
                <Th label="Method" />
                <Th label="Agent-callable" align="center" />
                <Th label="Ranked picks" align="center" />
                <Th label="Install-ready" align="center" />
                <Th label="Stays current" align="center" />
              </tr>
            </thead>
            <tbody>
              <Row
                method="mcpindex.ai"
                methodNote="recommendation API + drop-in MCP server"
                isPrimary
                cells={[
                  { value: 'yes', tone: 'pos' },
                  { value: 'yes', tone: 'pos', note: 'composite score' },
                  { value: 'yes', tone: 'pos', note: 'per-client config' },
                  { value: 'daily', tone: 'pos' },
                ]}
              />
              <Row
                method="Anthropic official registry"
                methodNote="registry.modelcontextprotocol.io"
                cells={[
                  { value: 'yes', tone: 'pos', note: 'raw HTTP' },
                  { value: 'no', tone: 'neg', note: 'paginated list' },
                  { value: 'partial', tone: 'mid', note: 'in payload' },
                  { value: 'live', tone: 'pos' },
                ]}
              />
              <Row
                method="Human directories"
                methodNote="PulseMCP · Smithery · Glama · MCP.so"
                cells={[
                  { value: 'no', tone: 'neg', note: 'browsing UX' },
                  { value: 'partial', tone: 'mid', note: 'hand-curated' },
                  { value: 'partial', tone: 'mid' },
                  { value: 'daily', tone: 'pos' },
                ]}
              />
              <Row
                method="awesome-mcp-servers (GitHub)"
                methodNote="punkpeye/awesome-mcp-servers"
                cells={[
                  { value: 'no', tone: 'neg' },
                  { value: 'no', tone: 'neg', note: 'flat list' },
                  { value: 'varies', tone: 'mid' },
                  { value: 'weekly', tone: 'mid', note: 'PR-driven' },
                ]}
              />
              <Row
                method="Ask the LLM directly"
                methodNote='e.g. "Claude, what MCP servers exist for X?"'
                cells={[
                  { value: 'yes', tone: 'pos' },
                  { value: 'no', tone: 'neg', note: 'hallucination-prone' },
                  { value: 'no', tone: 'neg' },
                  { value: 'training cutoff', tone: 'neg' },
                ]}
              />
            </tbody>
          </table>
        </div>

        <p className="mt-6">
          The honest framing: mcpindex.ai is a recommendation surface on top of the
          Anthropic registry &mdash; not a replacement for it. The registry is the
          canonical source of truth. Existing human directories serve a real purpose for
          developers browsing on a laptop. mcpindex.ai sits in the agent-callable slot
          between them and is designed for the moment your IDE or autonomous agent needs
          to pick a server in &lt;500ms with no human in the loop.
        </p>

        <p className="text-[13.5px]" style={{ color: 'var(--color-mute)' }}>
          Footnote on &ldquo;ranked picks&rdquo;: the registry returns servers in
          publication order; PulseMCP and Smithery offer hand-curated featured
          collections but no programmatic per-task ranking. mcpindex.ai computes a
          composite score (search match × MCP Quality Score) per request &mdash; see{' '}
          <Ext href="/methodology">/methodology</Ext> for the algorithm.
        </p>
      </Section>

      {/* §07 — Where to next */}
      <Section number="07" title="Where to next">
        <ul className="space-y-1.5 text-sm">
          <li>
            <Ext href="/api/v1/recommend?task=postgres+with+read+only+mode">
              /api/v1/recommend
            </Ext>{' '}
            — try the API live with any natural-language task
          </li>
          <li>
            <Ext href="/methodology">/methodology</Ext> — open MCP Quality Score
            methodology, source on GitHub
          </li>
          <li>
            <Ext href="/leaderboard">/leaderboard</Ext> — top 50 servers ranked by
            Quality Score
          </li>
          <li>
            <Ext href="/changelog.rss">/changelog.rss</Ext> — RSS feed of new servers
            indexed each day
          </li>
          <li>
            <Ext href="https://github.com/mcpindex-ai/mcp-server-mcpindex">
              github.com/mcpindex-ai/mcp-server-mcpindex
            </Ext>{' '}
            — npm package source, MIT
          </li>
        </ul>
        <p
          className="mt-6 text-xs"
          style={{ color: 'var(--color-mute)' }}
        >
          Found a gap, a typo, or a wiring question that isn&rsquo;t answered here?{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline hover:no-underline"
            style={{ color: 'var(--color-accent)' }}
          >
            hello@mcpindex.ai
          </a>
          .
        </p>
      </Section>
    </article>
  );
}

/* ─── Layout primitives ───────────────────────────────────────── */

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-14">
      <div
        className="flex items-baseline gap-3 border-t pt-6"
        style={{ borderColor: 'var(--color-rule)' }}
      >
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ fontFamily: FONT_MONO, color: 'var(--color-mute)' }}
        >
          §{number}
        </span>
        <h2
          className="text-[22px] tracking-tight font-medium"
          style={{ color: 'var(--color-ink)' }}
        >
          {title}
        </h2>
      </div>
      <div
        className="mt-3 space-y-4 text-[15px] leading-[1.6]"
        style={{ color: 'var(--color-cite)' }}
      >
        {children}
      </div>
    </section>
  );
}

function UseCase({
  letter,
  title,
  who,
  codeLines,
  notes,
}: {
  letter: string;
  title: string;
  who: string;
  codeLines: string[];
  notes?: string;
}) {
  return (
    <div
      className="rule-t pt-5"
      style={{ borderColor: 'var(--color-rule)' }}
    >
      <div className="flex items-baseline gap-3">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.18em]"
          style={{ fontFamily: FONT_MONO, color: 'var(--color-accent)' }}
        >
          {letter}
        </span>
        <h3
          className="text-[16px] tracking-tight font-semibold"
          style={{ color: 'var(--color-ink)' }}
        >
          {title}
        </h3>
      </div>
      <p
        className="mt-1 text-[14px] leading-[1.55]"
        style={{ color: 'var(--color-mute)' }}
      >
        {who}
      </p>
      <pre className="mt-3 overflow-x-auto bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
        <code>{codeLines.join('\n')}</code>
      </pre>
      {notes && (
        <p
          className="mt-2 text-[13px] leading-[1.5]"
          style={{ color: 'var(--color-mute)' }}
        >
          {notes}
        </p>
      )}
    </div>
  );
}

function ClientConfig({
  client,
  path,
  json,
}: {
  client: string;
  path: string;
  json: string;
}) {
  return (
    <div
      className="rule-t pt-5"
      style={{ borderColor: 'var(--color-rule)' }}
    >
      <h3
        className="text-[14px] font-semibold tracking-tight"
        style={{ color: 'var(--color-ink)' }}
      >
        {client}
      </h3>
      <p
        className="mt-1 text-[11.5px]"
        style={{ fontFamily: FONT_MONO, color: 'var(--color-mute)' }}
      >
        {path}
      </p>
      <pre className="mt-3 overflow-x-auto bg-[--color-ink] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
        <code>{json}</code>
      </pre>
    </div>
  );
}

function Limit({
  label,
  body,
}: {
  label: string;
  body: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[120px_1fr] gap-4">
      <span
        className="text-[11px] font-semibold uppercase tracking-[0.16em] pt-0.5"
        style={{ fontFamily: FONT_MONO, color: 'var(--color-ink)' }}
      >
        {label}
      </span>
      <p className="text-[14.5px] leading-[1.55]" style={{ color: 'var(--color-cite)' }}>
        {body}
      </p>
    </li>
  );
}

function Th({ label, align }: { label: string; align?: 'center' | 'left' }) {
  return (
    <th
      className="px-2 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.16em]"
      style={{
        fontFamily: FONT_MONO,
        color: 'var(--color-mute)',
        textAlign: align ?? 'left',
      }}
    >
      {label}
    </th>
  );
}

type Tone = 'pos' | 'mid' | 'neg';
type CellSpec = { value: string; tone: Tone; note?: string };

function Row({
  method,
  methodNote,
  isPrimary,
  cells,
}: {
  method: string;
  methodNote: string;
  isPrimary?: boolean;
  cells: CellSpec[];
}) {
  return (
    <tr
      style={{
        borderBottom: '1px solid var(--color-rule)',
        backgroundColor: isPrimary ? 'var(--color-accent-soft)' : 'transparent',
      }}
    >
      <td className="px-2 py-3 align-top">
        <div
          className="font-semibold text-[13.5px]"
          style={{ color: 'var(--color-ink)' }}
        >
          {method}
        </div>
        <div
          className="mt-0.5 text-[10.5px]"
          style={{ fontFamily: FONT_MONO, color: 'var(--color-mute)' }}
        >
          {methodNote}
        </div>
      </td>
      {cells.map((c, i) => (
        <Cell key={i} {...c} />
      ))}
    </tr>
  );
}

function Cell({ value, tone, note }: CellSpec) {
  const color =
    tone === 'pos'
      ? 'var(--color-accent)'
      : tone === 'neg'
        ? '#9a3412'
        : 'var(--color-cite)';
  const symbol = tone === 'pos' ? '✓' : tone === 'neg' ? '·' : '~';
  return (
    <td className="px-2 py-3 text-center align-top">
      <div
        className="text-[14px] font-semibold"
        style={{ color, fontFamily: FONT_MONO }}
      >
        <span aria-hidden className="mr-1">
          {symbol}
        </span>
        {value}
      </div>
      {note && (
        <div
          className="mt-0.5 text-[10px]"
          style={{ fontFamily: FONT_MONO, color: 'var(--color-mute)' }}
        >
          {note}
        </div>
      )}
    </td>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code
      className="text-[12.5px]"
      style={{ fontFamily: FONT_MONO, color: 'var(--color-ink)' }}
    >
      {children}
    </code>
  );
}

function Ext({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith('http');
  return (
    <a
      href={href}
      target={isExternal ? '_blank' : undefined}
      rel={isExternal ? 'noreferrer' : undefined}
      className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent] hover:decoration-[--color-accent]"
      style={{ color: 'var(--color-cite)' }}
    >
      {children}
    </a>
  );
}
