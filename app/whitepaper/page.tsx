import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Mark } from '@/components/Mark';
import { EnterpriseCTA } from '@/components/EnterpriseCTA';

export const metadata: Metadata = {
  title: 'Whitepaper',
  description:
    'mcpindex: the trust-to-act layer for agent tool calls. The in-path drift gate pins every MCP tool contract and HOLDs the call the moment it silently changes. The verdict is a contract-diff, not a safety oracle. Full architecture, threat model, methodology, and honest limits. Free to read; free PDF.',
  alternates: { canonical: 'https://mcpindex.ai/whitepaper' },
  openGraph: {
    title: 'mcpindex whitepaper - the trust-to-act layer for agent tool calls',
    description:
      'It pins every tool contract and holds the call the moment that contract moves. A change detector, not a safety oracle. Free to read; free PDF.',
    url: 'https://mcpindex.ai/whitepaper',
    type: 'article',
  },
};

// The converged whitepaper lives as committed markdown (content/whitepaper.md),
// read at request time and rendered server-side. The PDF is the same paper,
// branded, served as a static file - the download never depends on the form.
const PDF_HREF = '/whitepaper.pdf';

// react-markdown ships no raw-HTML support by default (the minimal-deps choice),
// so the markdown's HTML-comment render directives are dropped (correct), but a
// bare angle-bracket placeholder in prose (`<your-server>`) would be parsed as a
// dropped HTML tag and silently vanish. Strip the comments, then escape stray
// `<` everywhere OUTSIDE code (fenced + inline) so placeholders survive as
// literal text. We only escape `<` (not `>`), so blockquote `>` markers and the
// GFM tables stay intact.
function loadWhitepaper(): string {
  const raw = fs.readFileSync(path.join(process.cwd(), 'content/whitepaper.md'), 'utf8');
  const noComments = raw.replace(/<!--[\s\S]*?-->/g, '');
  return noComments
    .split(/(```[\s\S]*?```)/g)
    .map((segment, fenceIdx) => {
      if (fenceIdx % 2 === 1) return segment; // fenced code block - literal
      return segment
        .split(/(`[^`]*`)/g)
        .map((piece, inlineIdx) => (inlineIdx % 2 === 1 ? piece : piece.replace(/</g, '&lt;')))
        .join('');
    })
    .join('');
}

// Branded prose renderers. amber (#ea580c) stays reserved for the verdict token:
// it appears only on the list-marker dot, the blockquote rule, and link hover -
// matching /methodology. Geist Sans for prose, Geist Mono for identifiers/code.
const md: Components = {
  h1: ({ children }) => (
    <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)] tracking-[-0.02em]">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-14 pt-8 rule-t t-h3 font-medium text-[var(--color-ink)]">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-10 t-h4 font-medium text-[var(--color-ink)]">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-8 font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p className="mt-4 text-[15px] leading-[1.72] text-[var(--color-cite)]">{children}</p>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] hover:decoration-[var(--color-accent)]"
      {...(href && /^https?:\/\//.test(href) ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="mt-4 space-y-2 list-disc pl-5 marker:text-[var(--color-accent)]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 space-y-2 list-decimal pl-5 marker:font-mono marker:text-[var(--color-mute)]">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="pl-1 text-[15px] leading-[1.66] text-[var(--color-cite)]">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--color-ink)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="mt-6 border-l-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)] pl-5 pr-4 py-3 [&>p]:mt-0 [&>p+p]:mt-3 [&>p]:text-[14.5px]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-12 border-0 border-t border-[var(--color-rule)]" />,
  pre: ({ children }) => (
    <pre className="mt-6 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3.5 font-mono text-[12.5px] leading-[1.55]">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const text = String(children);
    const isBlock = (className?.startsWith('language-') ?? false) || text.includes('\n');
    if (isBlock) return <code className="font-mono">{children}</code>;
    return <code className="inline-code">{children}</code>;
  },
  table: ({ children }) => (
    <div className="mt-6 overflow-x-auto rule-t rule-b rule-l rule-r">
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[#fafaf9]">{children}</thead>,
  th: ({ children }) => (
    <th className="rule-b rule-r px-3 py-2 align-top font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="rule-b rule-r px-3 py-2 align-top text-[13px] leading-[1.55] text-[var(--color-cite)]">
      {children}
    </td>
  ),
  img: ({ src, alt }) =>
    typeof src === 'string' ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={alt ?? ''} className="mt-6 max-w-full rule-t rule-b rule-l rule-r" />
    ) : null,
};

export default function WhitepaperPage() {
  const content = loadWhitepaper();

  return (
    <article className="mx-auto max-w-[820px] px-6 sm:px-10 pt-16 pb-24">
      <header className="rule-b pb-8">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          <Mark size={14} />
          Whitepaper · v1.0 launch edition
        </div>
        <p className="mt-4 max-w-[640px] text-[14px] leading-[1.6] text-[var(--color-mute)]">
          Free to read in full below. Free PDF, no email required &mdash; the paper is the open,
          honest credibility engine, not a lead wall.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={PDF_HREF}
            download
            className="font-mono text-[12px] uppercase tracking-[0.14em] text-white bg-[var(--color-ink)] px-5 py-2.5 hover:bg-[var(--color-accent)] transition-colors"
          >
            Download the PDF &darr;
          </a>
          <a
            href={PDF_HREF}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--color-ink)] border border-[var(--color-rule)] px-5 py-2.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            Open in new tab &rarr;
          </a>
        </div>
      </header>

      <div className="mt-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={md}>
          {content}
        </ReactMarkdown>
      </div>

      <div className="mt-16">
        <EnterpriseCTA />
      </div>
    </article>
  );
}
