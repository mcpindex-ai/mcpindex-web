import Link from 'next/link';

const COLUMN_LABEL =
  'font-mono text-[10.5px] uppercase tracking-[0.18em] text-[--color-mute] mb-4';
const LINK =
  'block py-1 text-[13.5px] text-[--color-cite] hover:text-[--color-accent] transition-colors';

export function Footer() {
  return (
    <footer className="rule-t mt-32">
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1 max-w-[260px]">
            <div className="font-mono text-[14px] tracking-tight">
              mcpindex<span className="text-[--color-mute]">.ai</span>
            </div>
            <p className="mt-3 text-[12.5px] leading-[1.55] text-[--color-mute]">
              The agent-native index of MCP servers. Built so an IDE or agent can find the
              right server at inference time.
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[--color-mute]">
              Unofficial. Not affiliated with Anthropic.
            </p>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Product</div>
            <Link href="/best" className={LINK}>Best of</Link>
            <Link href="/leaderboard" className={LINK}>Leaderboard</Link>
            <Link href="/changelog" className={LINK}>Changelog</Link>
            <Link href="/api/v1/search?q=postgres" className={LINK}>Search API</Link>
            <Link href="/api/v1/recommend?task=read+pdfs" className={LINK}>Recommend API</Link>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Project</div>
            <Link href="/about" className={LINK}>About</Link>
            <Link href="/methodology" className={LINK}>Methodology</Link>
            <Link href="/stats" className={LINK}>Stats</Link>
            <a
              href="https://github.com/mcpindex"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              GitHub
            </a>
            <Link href="/changelog.rss" className={LINK}>
              RSS
            </Link>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Legal</div>
            <Link href="/terms" className={LINK}>Terms</Link>
            <Link href="/privacy" className={LINK}>Privacy</Link>
            <Link href="/pricing" className={LINK}>Pricing</Link>
            <a
              href="mailto:hello@mcpindex.ai"
              className={LINK}
            >
              hello@mcpindex.ai
            </a>
          </div>
        </div>

        <div className="rule-t mt-12 pt-6 flex flex-col sm:flex-row justify-between gap-3 text-[11.5px] text-[--color-mute]">
          <div className="font-mono">© 2026 GB</div>
          <div>
            Built by{' '}
            <a
              href="https://www.linkedin.com/in/gautambharti"
              target="_blank"
              rel="noreferrer"
              className="text-[--color-cite] hover:text-[--color-accent]"
            >
              Gautam Bharti
            </a>
            . Also runs{' '}
            <a
              href="https://seekgb.com"
              target="_blank"
              rel="noreferrer"
              className="text-[--color-cite] hover:text-[--color-accent]"
            >
              seekgb.com
            </a>
            .
          </div>
        </div>
      </div>
    </footer>
  );
}
