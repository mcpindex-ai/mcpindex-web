import Link from 'next/link';
import { Mark } from './Mark';
import { MobileMenu } from './MobileMenu';

// Primary nav is intent-grouped: the product action (Screen), the trust
// surface promoted to a peer (Trust), the developer docs, the commercial path
// (Pricing), and the directory (Rankings). Secondary/meta destinations
// (Best of, Changelog, About, Stats) live in the footer.
const NAV = [
  { href: '/screen', label: 'Screen' },
  { href: '/trust', label: 'Trust' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/leaderboard', label: 'Rankings' },
];

export function Header() {
  return (
    <header className="scroll-shadow">
      <div className="mx-auto max-w-[1180px] px-6 sm:px-10">
        <div className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="group flex items-center gap-2 text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
            aria-label="mcpindex.ai home"
          >
            <Mark size={20} />
            <span className="font-mono text-[15px] tracking-tight text-[var(--color-ink)]">
              mcpindex
              <span className="text-[var(--color-mute)]">.ai</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-mono text-[12.5px] tracking-tight text-[var(--color-mute)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/mcpindex-ai"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="text-[var(--color-mute)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </a>
            <MobileMenu items={NAV} />
          </div>
        </div>
      </div>
    </header>
  );
}
