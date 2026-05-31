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
    <div className="mx-auto max-w-[1180px] px-6 sm:px-10 py-12 sm:py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-500">
        Demo
      </p>
      <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-tight text-zinc-900">
        The trust-to-act layer, in 90 seconds.
      </h1>
      <p className="mt-4 max-w-2xl text-zinc-600 leading-relaxed">
        Agents don&apos;t just answer anymore - they act. Before your agent calls an MCP tool,
        mcpindex returns a verdict on whether the tool does what it claims. Here is the whole
        loop, end to end.
      </p>

      <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 shadow-sm bg-black">
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

      <section className="mt-14">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
          Embed it anywhere
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 leading-relaxed">
          Drop this into any page or share the link on social - it unfurls to a playable card on
          X and LinkedIn.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[12.5px] leading-relaxed text-zinc-800 font-mono">
          <code>{EMBED_SNIPPET}</code>
        </pre>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 font-mono text-[12.5px]">
          <a className="text-amber-700 hover:text-amber-800" href="/promo/mcpindex-promo.mp4">
            Direct video (.mp4)
          </a>
          <a className="text-amber-700 hover:text-amber-800" href={EMBED_URL}>
            Embed page
          </a>
          <a
            className="text-amber-700 hover:text-amber-800"
            href="https://twitter.com/intent/tweet?text=The%20trust-to-act%20layer%20for%20agents.&url=https%3A%2F%2Fmcpindex.ai%2Fdemo"
            target="_blank"
            rel="noreferrer"
          >
            Share on X
          </a>
        </div>
      </section>
    </div>
  );
}
