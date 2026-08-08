import type { Metadata } from 'next';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import Link from 'next/link';
import { getInstallReceipts } from '@/lib/receiptIngest';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gate Activity',
  robots: { index: false, follow: false },
  // Without an explicit canonical this page inherits the root layout's
  // `alternates.canonical` — the homepage — and then ships two contradictory
  // instructions: the canonical says "index the homepage in place of this URL",
  // the robots tag says "index nothing here". Self-canonical leaves noindex as
  // the only signal. This is the only 200-status PAGE that leaked the root
  // canonical (the other 40 either declare their own or route through
  // lib/seo.ts `pageMetadata()`); app/not-found.tsx had the same defect on every
  // 404 and is fixed there with `canonical: null`, which is the right answer
  // when a component renders at many URLs rather than one.
  alternates: { canonical: 'https://mcpindex.ai/receipts' },
};

const INSTALL_ID_RE = /^[0-9a-f]{32}$/;

type PageProps = { searchParams: Promise<{ id?: string }> };

export default async function ReceiptsPage({ searchParams }: PageProps) {
  const { id } = await searchParams;

  if (!id || !INSTALL_ID_RE.test(id)) {
    return (
      <article className="site-container pt-16 pb-24 bg-[var(--color-paper)]">
        <header>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
            Gate Activity
          </div>
          <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Your tool calls.</h1>
        </header>
        <p className="mt-8 text-[15px] leading-[1.55] text-[var(--color-mute)]">
          Install ID missing or invalid. Your install ID is printed by the gate at install
          time and is part of your receipts URL (<span className="font-mono">/receipts?id=…</span>).{' '}
          <Link href="/guides/read-your-gate-activity" className="underline">
            How to read your gate activity
          </Link>
          .
        </p>
        <Figure id="anatomy-of-a-hold">{renderDiagram('anatomy-of-a-hold')}</Figure>
    </article>
    );
  }

  const receipts = await getInstallReceipts(id);

  return (
    <article className="site-container pt-16 pb-24 bg-[var(--color-paper)]">
      <header>
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
          Gate Activity
        </div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Your tool calls.</h1>
        <p className="mt-3 font-mono text-[11px] text-[var(--color-mute)]">
          Install {id.slice(0, 8)}... | credential-blind | no args, no content
        </p>
      </header>

      {receipts.length === 0 ? (
        <div className="mt-10 border border-[var(--color-rule)] bg-white px-5 py-6">
          <p className="text-[15px] leading-[1.55] text-[var(--color-ink)]">
            No activity yet for this install ID. If you just installed the gate, calls appear
            here after your first gated call. If you reached this by typing the URL, double-check
            the install ID printed by the gate at install time.
          </p>
        </div>
      ) : (
        <ul className="mt-10 divide-y divide-[var(--color-rule)] border-t border-[var(--color-rule)]">
          {receipts.map((rec) => (
            <li
              key={rec.rid}
              className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 py-3 font-mono text-[12px]"
            >
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                  tool
                </div>
                <div className="mt-0.5 text-[var(--color-ink)]">{rec.th.slice(7, 23)}</div>
              </div>
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                  verdict
                </div>
                <div className="mt-0.5 text-[var(--color-ink)]">{rec.v}</div>
              </div>
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                  action
                </div>
                <div className="mt-0.5 text-[var(--color-ink)]">{rec.a}</div>
              </div>
              <div>
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                  date
                </div>
                <div className="mt-0.5 text-[var(--color-mute)]">{rec.ts.slice(0, 10)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* What each row above means, read against a real HOLD. The figure also renders in the
          no-install-id branch, but placing it ONLY there was the defect: it appeared for anyone
          arriving without an id and vanished for the actual user reading their own activity,
          who is exactly the person a "verdict" column sends looking for an explanation. */}
      <Figure id="anatomy-of-a-hold">{renderDiagram('anatomy-of-a-hold')}</Figure>
    </article>
  );
}
