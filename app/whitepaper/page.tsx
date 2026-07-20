import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Mark } from '@/components/Mark';
import { md, escapeAnglesOutsideCode } from '@/components/proseComponents';
import { safeMarkdownUrl } from '@/lib/safeUrl';

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
  // Strip the markdown's HTML-comment render directives, then escape stray `<`
  // outside code so bare placeholders survive react-markdown (shared helper).
  return escapeAnglesOutsideCode(raw.replace(/<!--[\s\S]*?-->/g, ''));
}

export default function WhitepaperPage() {
  const content = loadWhitepaper();

  return (
    <article className="site-container pt-16 pb-24">
      <header className="rule-b pb-8">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          <Mark size={14} />
          Whitepaper · v1.0 launch edition
        </div>
        <p className="mt-4 text-[14px] leading-[1.6] text-[var(--color-mute)]">
          Free to read in full below. Free PDF, no email required - the paper is the open,
          honest credibility engine, not a lead wall.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href={PDF_HREF}
            download
            className="font-mono text-[12px] uppercase tracking-[0.14em] text-white bg-[var(--color-ink)] px-5 py-2.5 hover:bg-[var(--color-accent-strong)] transition-colors"
          >
            Download the PDF &darr;
          </a>
          <a
            href={PDF_HREF}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--color-ink)] border border-[var(--color-rule)] px-5 py-2.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
          >
            Open in new tab &rarr;
          </a>
        </div>
      </header>

      <div className="mt-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={md} urlTransform={safeMarkdownUrl}>
          {content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
