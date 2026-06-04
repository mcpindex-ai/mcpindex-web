import type { Metadata } from 'next';
import DriftGateDemo from '@/components/DriftGateDemo';

const VIDEO_URL = 'https://mcpindex.ai/promo/mcpindex-promo.mp4';
const EMBED_URL = 'https://mcpindex.ai/embed.html';

export const metadata: Metadata = {
  title: 'Demo',
  description:
    'Watch the gate hold a silent tool-contract change. Pin an MCP tool\'s contract, apply a silent change, and watch the in-path gate HOLD the call before your agent acts - a contract-diff, not a safety verdict.',
  alternates: { canonical: '/demo' },
  openGraph: {
    title: 'mcpindex - watch the gate hold a silent tool-contract change',
    description:
      'Pin an MCP tool\'s contract; apply a silent change; watch the in-path gate HOLD the call before your agent acts - a contract-diff, not a safety verdict.',
    url: 'https://mcpindex.ai/demo',
    type: 'video.other',
    images: [{ url: '/promo/og.jpg', width: 1200, height: 630 }],
    videos: [
      { url: VIDEO_URL, secureUrl: VIDEO_URL, type: 'video/mp4', width: 1920, height: 1080 },
    ],
  },
  twitter: {
    card: 'player',
    title: 'mcpindex - watch the gate hold a silent tool-contract change',
    description:
      'Pin an MCP tool\'s contract; apply a silent change; watch the in-path gate HOLD the call before your agent acts - a contract-diff, not a safety verdict.',
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
        Agents don&apos;t just answer anymore - they act. The tool your agent trusted on Monday
        can change on Tuesday, silently. mcpindex pins every tool&apos;s contract and HOLDs the
        call the moment the contract drifts - before your agent acts on the change.
      </p>

      <section className="mt-10 max-w-[900px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
          Watch it hold a drift
        </div>
        <p className="mb-5 max-w-[640px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
          A tool with a pinned contract. Apply a silent change and watch the in-path gate decide,
          deterministically, whether your agent should act on it. The verdicts here are the same
          ones the real gate produces.
        </p>
        <DriftGateDemo />
      </section>

      {/* Two complementary films: A = the concept (why), B = how to use it (how). No overlap. */}
      <section className="mt-16 max-w-[900px]">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
          The concept, in ~70 seconds
        </div>
        <p className="mb-5 max-w-[640px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
          Why the gate exists: a tool&apos;s contract can change silently after you trust it. Watch
          mcpindex hold the call before your agent acts, proven in Cursor.
        </p>
      </section>

      <div className="mt-5 max-w-[900px] rule-t rule-b rule-l rule-r bg-black">
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
          How to use it, by persona
        </div>
        <p className="mb-5 max-w-[640px] text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
          One-click install, then the gate pins every tool and holds a silent change before your
          agent runs it. By persona: MCP-client user, SDK builder, enterprise.
        </p>
      </section>

      <div className="mt-5 max-w-[900px] rule-t rule-b rule-l rule-r bg-black">
        <video
          className="w-full aspect-video"
          controls
          playsInline
          preload="metadata"
          poster="/promo/poster.jpg"
        >
          <source src="/promo/mcpindex-demo.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>

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
