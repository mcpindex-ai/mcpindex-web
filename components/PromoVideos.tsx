import Link from 'next/link';

type FilmId = 'concept' | 'persona';

type Film = {
  readonly id: FilmId;
  readonly label: string;
  readonly blurb: string;
  readonly src: string;
  readonly poster: string;
};

const FILMS: ReadonlyArray<Film> = [
  {
    id: 'concept',
    label: 'The concept, in ~70 seconds',
    blurb:
      "Why the gate exists: a tool's contract can change silently after you trust it. Watch mcpindex hold the call before your agent acts on the change.",
    src: '/promo/mcpindex-promo.mp4',
    poster: '/promo/poster.jpg',
  },
  {
    id: 'persona',
    label: 'How to use it, by persona',
    blurb:
      'One-click install, then the gate pins every tool and holds a silent change before your agent runs it. By persona: MCP-client user, SDK builder, enterprise.',
    src: '/promo/mcpindex-demo.mp4',
    poster: '/promo/poster-demo.jpg',
  },
];

type PromoVideosProps = {
  /** Which film(s) to render. Homepage splits concept (after hero) and persona (below #demo). */
  readonly variant?: FilmId | 'both';
  readonly showDemoLink?: boolean;
};

/** Gate-centered promo films. Served from /public/promo. */
export function PromoVideos({ variant = 'both', showDemoLink = false }: PromoVideosProps) {
  const films =
    variant === 'both' ? FILMS : FILMS.filter((film) => film.id === variant);

  return (
    <div className="space-y-16">
      {films.map((film) => (
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
