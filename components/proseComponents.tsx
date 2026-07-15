import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeMarkdownUrl } from '@/lib/safeUrl';

// Shared markdown prose renderers for /whitepaper and /guides so the two long-form
// surfaces read as one system. amber (#ea580c) stays reserved for the verdict token:
// it appears only on the list-marker dot, the blockquote rule, and link hover -
// matching /methodology. Geist Sans for prose, Geist Mono for identifiers/code.

// react-markdown ships no raw-HTML support by default (the minimal-deps choice), so
// a bare angle-bracket placeholder in prose (`<your-server>`) would be parsed as a
// dropped HTML tag and silently vanish. Escape stray `<` everywhere OUTSIDE code
// (fenced + inline) so placeholders survive as literal text. We only escape `<`
// (not `>`), so blockquote `>` markers and GFM tables stay intact.
export function escapeAnglesOutsideCode(raw: string): string {
  return raw
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

export const md: Components = {
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
    <div className="mt-6 site-table-wrap rule-t rule-b rule-l rule-r">
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

// The shared long-form renderer for /guides (walkthrough + classic body): GFM
// markdown through the `md` map, with stray angle brackets escaped so
// `<placeholder>` text survives. `urlTransform` routes every markdown link/image
// href through safeMarkdownUrl, so a body link like `[x](//evil.com)` in
// human-merged guide JSON can't become an off-origin open redirect (the same
// class isSafeHref closes for structured deep_link/next hrefs).
export function Prose({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={md} urlTransform={safeMarkdownUrl}>
      {escapeAnglesOutsideCode(children)}
    </ReactMarkdown>
  );
}
