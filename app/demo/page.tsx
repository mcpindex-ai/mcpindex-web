import type { Metadata } from 'next';

const VIDEO_URL = 'https://mcpindex.ai/promo/mcpindex-promo.mp4';
const EMBED_URL = 'https://mcpindex.ai/embed.html';

export const metadata: Metadata = {
  title: 'Demo',
  description:
    'A 90-second demo: before your agent acts, mcpindex returns a verdict on whether an MCP tool does what it claims.',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'mcpindex - the trust-to-act layer, in 90 seconds',
    description:
      'Before your agent acts, mcpindex returns a verdict on whether an MCP tool does what it claims.',
    url: 'https://mcpindex.ai/demo',
    type: 'video.other',
    images: [{ url: '/promo/og.jpg', width: 1200, height: 630 }],
    videos: [
      { url: VIDEO_URL, secureUrl: VIDEO_URL, type: 'video/mp4', width: 1920, height: 1080 },
    ],
  },
  twitter: {
    card: 'player',
    title: 'mcpindex - the trust-to-act layer, in 90 seconds',
    description:
      'Before your agent acts, mcpindex returns a verdict on whether an MCP tool does what it claims.',
    images: ['/promo/og.jpg'],
    players: [{ playerUrl: EMBED_URL, streamUrl: VIDEO_URL, width: 1920, height: 1080 }],
  },
};

const EMBED_SNIPPET = `<iframe src="${EMBED_URL}" width="720" height="405"
  style="border:0;border-radius:12px;max-width:100%" allowfullscreen
  allow="fullscreen; encrypted-media; picture-in-picture"
  title="mcpindex - 90-second demo"></iframe>`;

export default function DemoPage() {
  return (
    <div className="mx-auto max-w-[1180px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Demo
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        The trust-to-act layer, in 90 seconds.
      </h1>
      <p className="mt-5 max-w-[640px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        Agents don&apos;t just answer anymore - they act. Before your agent calls an MCP
        tool, mcpindex returns a verdict on whether the tool does what it claims. Here is the
        whole loop, end to end.
      </p>

      <div className="mt-8 max-w-[900px] rule-t rule-b rule-l rule-r bg-black">
        <video
          className="w-full aspect-video"
          controls
          playsInline
          preload="metadata"
          poster="/promo/poster.jpg"
        >
          <source src="/promo/mcpindex-promo.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>

      <section className="mt-16 max-w-[900px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
          How to use it, by setup
        </div>
        <h2 className="t-h3 font-medium text-[var(--color-ink)]">
          However you build, the same gate.
        </h2>
        <p className="mt-3 mb-6 max-w-[640px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
          Claude Code and Cursor, the OpenAI or Anthropic API, or a whole fleet - the same
          verdict before your agent acts, with the command for each.
        </p>
        <div className="rule-t rule-b rule-l rule-r bg-black">
          <video
            className="w-full aspect-video"
            controls
            playsInline
            preload="metadata"
            poster="/promo/poster-demo.jpg"
          >
            <source src="/promo/mcpindex-demo.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
        <div className="mt-4 font-mono text-[12.5px]">
          <a
            className="text-[var(--color-cite)] hover:text-[var(--color-accent)]"
            href="/promo/mcpindex-demo.mp4"
          >
            Direct video (.mp4) →
          </a>
        </div>
      </section>

      <section className="mt-16 max-w-[900px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
          Embed it anywhere
        </div>
        <p className="max-w-[620px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
          Drop this into any page, or share the link on social - it unfurls to a playable
          card on X and LinkedIn.
        </p>
        <pre className="mt-4 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-snug">
          <code>{EMBED_SNIPPET}</code>
        </pre>
        <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[12.5px]">
          <a className="text-[var(--color-cite)] hover:text-[var(--color-accent)]" href="/promo/mcpindex-promo.mp4">
            Direct video (.mp4) →
          </a>
          <a className="text-[var(--color-cite)] hover:text-[var(--color-accent)]" href={EMBED_URL}>
            Embed page →
          </a>
          <a
            className="text-[var(--color-cite)] hover:text-[var(--color-accent)]"
            href="https://twitter.com/intent/tweet?text=The%20trust-to-act%20layer%20for%20agents.&url=https%3A%2F%2Fmcpindex.ai%2Fdemo"
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
