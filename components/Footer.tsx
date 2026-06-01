import Link from 'next/link';
import { Mark } from './Mark';

const COLUMN_LABEL =
  'font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-4';
const LINK =
  'block py-1 text-[13.5px] text-[var(--color-cite)] hover:text-[var(--color-accent)] transition-colors';

export function Footer() {
  return (
    <footer className="rule-t mt-32">
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 md:col-span-1 max-w-[260px]">
            <div className="flex items-center gap-2 text-[var(--color-ink)]">
              <Mark size={18} />
              <span className="font-mono text-[14px] tracking-tight">
                mcpindex<span className="text-[var(--color-mute)]">.ai</span>
              </span>
            </div>
            <p className="mt-3 text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
              The trust layer for MCP tools. A verdict on whether a tool does what
              it claims, before your agent acts.
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
              Unofficial. Not affiliated with Anthropic.
            </p>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Product</div>
            <Link href="/screen" className={LINK}>Screen a tool</Link>
            <Link href="/docs" className={LINK}>Docs</Link>
            <Link href="/pricing" className={LINK}>Pricing</Link>
            <Link href="/leaderboard" className={LINK}>Rankings</Link>
            <Link href="/best" className={LINK}>Best of</Link>
            <Link href="/changelog" className={LINK}>Changelog</Link>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Trust</div>
            <Link href="/trust" className={LINK}>Trust model</Link>
            <Link href="/methodology" className={LINK}>Methodology</Link>
            <Link href="/status" className={LINK}>Status</Link>
            <Link href="/stats" className={LINK}>Stats</Link>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Project</div>
            <Link href="/about" className={LINK}>About</Link>
            <Link href="/brand" className={LINK}>Brand</Link>
            <a
              href="https://github.com/mcpindex-ai"
              target="_blank"
              rel="noreferrer"
              className={LINK}
            >
              GitHub
            </a>
            <Link href="/llms.txt" className={LINK}>/llms.txt</Link>
            <Link href="/changelog.rss" className={LINK}>RSS</Link>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Legal</div>
            <Link href="/terms" className={LINK}>Terms</Link>
            <Link href="/privacy" className={LINK}>Privacy</Link>
            <a href="mailto:hello@mcpindex.ai" className={LINK}>
              Contact us
            </a>
          </div>
        </div>

        <div className="rule-t mt-12 pt-6 flex flex-col sm:flex-row justify-between gap-3 font-mono text-[11.5px] text-[var(--color-mute)]">
          <div>© 2026 Bhartis LLC</div>
          <div>mcpindex.ai · the trust layer for MCP tools</div>
        </div>
      </div>
    </footer>
  );
}
