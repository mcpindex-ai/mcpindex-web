import Link from 'next/link';

type Film = {
  readonly label: string;
  readonly blurb: string;
  readonly src: string;
  readonly poster: string;
};

const FILMS: ReadonlyArray<Film> = [
  {
    label: 'The concept, in ~60 seconds',
    blurb:
      "Why the gate exists: a tool's contract can change silently after you trust it. Pin on first sight, diff on every call, HOLD before your agent acts on the change — a contract-diff, not a safety verdict.",
    src: '/promo/mcpindex-promo.mp4',
    poster: '/promo/poster.jpg',
  },
  {
    label: 'How to use it, by persona',
    blurb:
      'Same in-path gate, three surfaces: one-click install in Claude Desktop, Cursor, Cline, or Zed; a server-side diffGate for OpenAI/Anthropic agents; fleet posture and HOLD audit for enterprise. Pin, diff, HOLD — contract-diff, not a safety verdict.',
    src: '/promo/mcpindex-demo.mp4',
    poster: '/promo/poster-demo.jpg',
  },
];

/** The two gate-centered promo films (concept + persona). Served from /public/promo. */
export function PromoVideos({ showDemoLink = false }: { showDemoLink?: boolean }) {
  return (
    <div className="space-y-16">
      {FILMS.map((film) => (
        <section key={film.src}>
          <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-3">
            {film.label}
          </div>
          <p className="mb-5 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">{film.blurb}</p>
          <div className="rule-t rule-b rule-l rule-r bg-black">
            <video
              className="w-full aspect-video"
              controls
              playsInline
              preload="metadata"
              poster={film.poster}
            >
              <source src={film.src} type="video/mp4" />
              Your browser does not support the video tag.{' '}
              <a href={film.src} className="underline">
                Download the .mp4
              </a>
              .
            </video>
          </div>
        </section>
      ))}
      {showDemoLink && (
        <p className="font-mono text-[12px]">
          <Link
            href="/demo"
            className="text-[var(--color-cite)] hover:text-[var(--color-accent)] underline decoration-[var(--color-rule)] underline-offset-4"
          >
            Full demo page (interactive gate + embed snippet) →
          </Link>
        </p>
      )}
    </div>
  );
}
