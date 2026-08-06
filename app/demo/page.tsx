import type { Metadata } from 'next';
import Link from 'next/link';
import { PromoVideos } from '@/components/PromoVideos';

const VIDEO_URL = 'https://mcpindex.ai/promo/mcpindex-promo.mp4';
const EMBED_URL = 'https://mcpindex.ai/embed.html';

export const metadata: Metadata = {
  title: 'Videos & embed',
  description:
    'Overview and persona walkthrough for the in-path drift gate, plus embed and share links. Interactive demo lives on the homepage.',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'mcpindex - watch the gate hold a silent tool-contract change',
    description:
      'Pin an MCP tool\'s contract; apply a silent change; watch the in-path gate HOLD the call before your agent acts - a contract-diff, not a safety verdict.',
    url: 'https://mcpindex.ai/demo',
    type: 'video.other',
    videos: [
      { url: VIDEO_URL, secureUrl: VIDEO_URL, type: 'video/mp4', width: 1920, height: 1080 },
    ],
  },
  twitter: {
    card: 'player',
    title: 'mcpindex - watch the gate hold a silent tool-contract change',
    description:
      'Pin an MCP tool\'s contract; apply a silent change; watch the in-path gate HOLD the call before your agent acts - a contract-diff, not a safety verdict.',
    players: [{ playerUrl: EMBED_URL, streamUrl: VIDEO_URL, width: 1920, height: 1080 }],
  },
};

const EMBED_SNIPPET = `<iframe src="${EMBED_URL}" width="720" height="405"
  style="border:0;border-radius:12px;max-width:100%" allowfullscreen
  allow="fullscreen; encrypted-media; picture-in-picture"
  title="mcpindex - overview demo"></iframe>`;

export default function DemoPage() {
  return (
    <div className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Videos &amp; embed
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        How to use it - and share it.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Overview and persona films below. For the interactive drift gate, use the{' '}
        <Link
          href="/#demo"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
        >
          homepage demo
        </Link>
        .
      </p>

      <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px]">
        <a
          href="#overview"
          className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] underline decoration-[var(--color-rule)] underline-offset-4"
        >
          Overview film →
        </a>
        <Link
          href="/#demo"
          className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] underline decoration-[var(--color-rule)] underline-offset-4"
        >
          Try the interactive gate →
        </Link>
        <Link
          href="/#install"
          className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)] underline decoration-[var(--color-rule)] underline-offset-4"
        >
          Install now →
        </Link>
      </div>

      <div id="overview" className="mt-14 scroll-mt-20">
        <PromoVideos variant="concept" />
      </div>

      <div className="mt-14">
        <PromoVideos variant="persona" />
      </div>

      <section className="mt-16">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
          Embed it anywhere
        </div>
        <p className="text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
          Drop this into any page, or share the link on social - it unfurls to a playable card on
          X and LinkedIn. The lightweight embed plays the overview film.
        </p>
        <pre className="mt-4 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
          <code>{EMBED_SNIPPET}</code>
        </pre>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[12.5px]">
          <a className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]" href="/promo/mcpindex-promo.mp4">
            Overview video (.mp4) →
          </a>
          <a className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]" href="/promo/mcpindex-demo.mp4">
            Persona video (.mp4) →
          </a>
          <a className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]" href={EMBED_URL}>
            Embed page →
          </a>
          <a
            className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
            href="https://twitter.com/intent/tweet?text=The%20in-path%20trust%20gate%20for%20agent%20tool%20calls.&url=https%3A%2F%2Fmcpindex.ai%2Fdemo"
            target="_blank"
            rel="noreferrer"
          >
            Share on X →
          </a>
        </div>
      </section>
    </div>
  );
}
