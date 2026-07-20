import Link from 'next/link';
import { Mark } from './Mark';
import { ContactTrigger } from './ContactModal';

const COLUMN_LABEL =
  'font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-4';
const LINK =
  'block py-1 text-[13.5px] text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] transition-colors';

export function Footer() {
  return (
    <footer className="rule-t mt-32" role="contentinfo">
      <div className="site-container py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2 md:col-span-1 max-w-[260px]">
            <div className="flex items-center gap-2 text-[var(--color-ink)]">
              <Mark size={18} />
              <span className="font-mono text-[14px] tracking-tight">
                mcpindex<span className="text-[var(--color-mute)]">.ai</span>
              </span>
            </div>
            <p className="mt-3 text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
              The in-path trust gate for agent tool calls. It pins each MCP
              tool&rsquo;s contract and HOLDs a call when the contract silently
              changes - before your agent acts.
            </p>
            <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
              Unofficial. Not affiliated with Anthropic.
            </p>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Product</div>
            <Link href="/#install" className={LINK}>Install</Link>
            <Link href="/#demo" className={LINK}>Try the gate</Link>
            <Link href="/demo" className={LINK}>Videos &amp; embed</Link>
            <Link href="/docs" className={LINK}>Docs</Link>
            <Link href="/search" className={LINK}>Search</Link>
            <Link href="/screen" className={LINK}>Screen</Link>
            <Link href="/scan" className={LINK}>Scan</Link>
            <Link href="/claim" className={LINK}>Claim your server</Link>
            <Link href="/leaderboard" className={LINK}>Maturity Rankings</Link>
            <Link href="/best" className={LINK}>Best of</Link>
            <Link href="/servers" className={LINK}>All servers</Link>
            <Link href="/changelog" className={LINK}>Changelog</Link>
            <Link href="/guides" className={LINK}>Guides</Link>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Trust</div>
            <Link href="/trust" className={LINK}>Trust model</Link>
            <Link href="/whitepaper" className={LINK}>Whitepaper</Link>
            <Link href="/methodology" className={LINK}>Methodology</Link>
            <Link href="/status" className={LINK}>Status</Link>
            <Link href="/stats" className={LINK}>Stats</Link>
            <Link href="/ledger" className={LINK}>Drift ledger</Link>
            <Link href="/dashboard" className={LINK}>Drift dashboard</Link>
          </div>

          <div>
            <div className={COLUMN_LABEL}>Project</div>
            <Link href="/about" className={LINK}>About</Link>
            <Link href="/brand" className={LINK}>Brand</Link>
            <Link href="/which-mcpindex" className={LINK}>Which mcpindex?</Link>
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
            <Link href="/accessibility" className={LINK}>Accessibility</Link>
            <ContactTrigger className={`${LINK} text-left w-full`}>
              Contact
            </ContactTrigger>
          </div>
        </div>

        <div className="rule-t mt-12 pt-6 flex flex-col sm:flex-row justify-between gap-3 font-mono text-[11.5px] text-[var(--color-mute)]">
          <div>© 2026 mcpindex.ai</div>
          <div>mcpindex.ai · the in-path trust gate for agent tool calls</div>
        </div>
      </div>
    </footer>
  );
}
