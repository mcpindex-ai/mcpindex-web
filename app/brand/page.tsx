import type { Metadata } from 'next';
import { ContactTrigger } from '@/components/ContactModal';
import { Mark } from '@/components/Mark';
import { Seal } from '@/components/Seal';

export const metadata: Metadata = {
  title: 'Brand',
  description:
    'The mcpindex brand kit: the bracket-verdict mark, the seal, the color and type system, and downloadable logo, avatar, and social assets.',
};

const DL =
  'inline-flex items-center gap-1.5 font-mono text-[12px] text-[var(--color-cite)] border border-[var(--color-rule)] px-2.5 py-1.5 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors';
const LABEL = 'font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]';

function Swatch({ name, hex, ink = false }: { name: string; hex: string; ink?: boolean }) {
  return (
    <div className="rule-b rule-r p-4">
      <div className="h-14 w-full rule-t rule-b rule-l rule-r" style={{ background: hex }} />
      <div className="mt-3 text-[13px] text-[var(--color-ink)]">{name}</div>
      <div className="font-mono text-[11px] text-[var(--color-mute)] uppercase">{hex}</div>
      {ink && <div className="font-mono text-[10px] text-[var(--color-mute)] mt-0.5">reserved for the verdict token</div>}
    </div>
  );
}

export default function BrandPage() {
  return (
    <article className="mx-auto max-w-[900px] px-6 sm:px-10 pt-16 pb-24">
      <div className={LABEL}>Brand</div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">The mcpindex brand kit.</h1>
      <p className="mt-5 max-w-[680px] text-[16px] leading-[1.6] text-[var(--color-cite)]">
        One idea at every scale: the amber decision token is the atom, the bracket is the mark,
        the seal is a sealed (anchored) verdict, and the Verdict Card is the object. Assets below
        are free to use for referencing mcpindex; don&apos;t alter the proportions or recolor the
        token.
      </p>

      {/* mark + seal */}
      <section className="mt-14 rule-t pt-10">
        <div className={LABEL}>The mark &amp; the seal</div>
        <div className="mt-6 grid sm:grid-cols-2 gap-6">
          <div className="rule-t rule-b rule-l rule-r p-8 flex flex-col items-center">
            <div className="text-[var(--color-ink)]"><Mark size={92} /></div>
            <div className="mt-5 text-[14px] text-[var(--color-ink)]">Mark</div>
            <div className="text-[12px] text-[var(--color-mute)] text-center mt-1">header · favicon · wordmark</div>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <a href="/brand/mark.svg" download className={DL}>mark.svg</a>
              <a href="/brand/mark-mono.svg" download className={DL}>mono.svg</a>
            </div>
          </div>
          <div className="rule-t rule-b rule-l rule-r p-8 flex flex-col items-center">
            <div className="text-[var(--color-ink)]"><Seal size={92} /></div>
            <div className="mt-5 text-[14px] text-[var(--color-ink)]">Seal</div>
            <div className="text-[12px] text-[var(--color-mute)] text-center mt-1">a sealed, anchored verdict · avatars · app icon</div>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <a href="/brand/seal.svg" download className={DL}>seal.svg</a>
              <a href="/brand/seal-inverted.svg" download className={DL}>inverted.svg</a>
            </div>
          </div>
        </div>
      </section>

      {/* the system */}
      <section className="mt-12 rule-t pt-10">
        <div className={LABEL}>One idea at four scales</div>
        <div className="mt-6 flex flex-wrap items-center gap-5 text-[var(--color-ink)]">
          <span className="inline-block w-9 h-3 rounded-[3px] bg-[var(--color-accent)]" />
          <span className="text-[var(--color-mute)]">&rarr;</span>
          <Mark size={48} />
          <span className="text-[var(--color-mute)]">&rarr;</span>
          <Seal size={52} />
          <span className="text-[var(--color-mute)]">&rarr;</span>
          <div className="rule-t rule-b rule-l rule-r bg-white elevate p-3 w-[150px]">
            <span className="inline-block w-12 h-3.5 rounded-[3px] bg-[var(--color-accent)]" />
            <div className="mt-2.5 h-[5px] w-full bg-[var(--color-rule)] rounded" />
            <div className="mt-1.5 h-[5px] w-2/3 bg-[var(--color-rule)] rounded" />
          </div>
        </div>
        <p className="mt-4 font-mono text-[12px] text-[var(--color-mute)]">
          token (atom) &rarr; bracket (mark) &rarr; seal (anchored verdict) &rarr; Verdict Card (object)
        </p>
      </section>

      {/* color */}
      <section className="mt-12 rule-t pt-10">
        <div className={LABEL}>Color</div>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 rule-t rule-l">
          <Swatch name="Ink" hex="#0a0a0a" />
          <Swatch name="Amber" hex="#ea580c" ink />
          <Swatch name="Mute" hex="#78716c" />
          <Swatch name="Rule" hex="#e7e5e4" />
        </div>
        <p className="mt-4 text-[13.5px] leading-[1.6] text-[var(--color-cite)] max-w-[640px]">
          The site is ink on paper. Amber is reserved almost entirely for the verdict token, so
          color always means &ldquo;a verdict.&rdquo;
        </p>
      </section>

      {/* type */}
      <section className="mt-12 rule-t pt-10">
        <div className={LABEL}>Typography</div>
        <div className="mt-6 grid sm:grid-cols-2 gap-6">
          <div className="rule-t rule-b rule-l rule-r p-6">
            <div className="text-[34px] tracking-[-0.02em] text-[var(--color-ink)]">Geist Sans</div>
            <div className="text-[13px] text-[var(--color-mute)] mt-2">prose, headings</div>
          </div>
          <div className="rule-t rule-b rule-l rule-r p-6">
            <div className="font-mono text-[30px] tracking-tight text-[var(--color-ink)]">Geist Mono</div>
            <div className="font-mono text-[13px] text-[var(--color-mute)] mt-2">identifiers, commands, verdicts</div>
          </div>
        </div>
      </section>

      {/* downloads */}
      <section className="mt-12 rule-t pt-10">
        <div className={LABEL}>Downloads</div>
        <div className="mt-6 space-y-5">
          <div>
            <div className="text-[13px] text-[var(--color-ink)] mb-2">Avatars (512&times;512)</div>
            <div className="flex flex-wrap gap-2">
              <a href="/brand/avatar-light.png" download className={DL}>light</a>
              <a href="/brand/avatar-dark.png" download className={DL}>dark</a>
              <a href="/brand/avatar-amber.png" download className={DL}>amber</a>
            </div>
          </div>
          <div>
            <div className="text-[13px] text-[var(--color-ink)] mb-2">Social banners</div>
            <div className="flex flex-wrap gap-2">
              <a href="/brand/x-header.png" download className={DL}>X header 1500&times;500</a>
              <a href="/brand/linkedin-banner.png" download className={DL}>LinkedIn 1584&times;396</a>
              <a href="/brand/github-readme.png" download className={DL}>GitHub 1280&times;400</a>
            </div>
          </div>
          <div>
            <div className="text-[13px] text-[var(--color-ink)] mb-2">App icons</div>
            <div className="flex flex-wrap gap-2">
              <a href="/icon.svg" download className={DL}>favicon.svg</a>
              <a href="/brand/icon-512.png" download className={DL}>icon 512</a>
              <a href="/apple-icon.png" download className={DL}>apple 180</a>
            </div>
          </div>
        </div>
      </section>

      {/* usage */}
      <section className="mt-12 rule-t pt-10">
        <div className={LABEL}>Usage</div>
        <div className="mt-6 grid sm:grid-cols-2 gap-6">
          <div className="rule-t rule-b rule-l rule-r p-6">
            <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-emerald-700 mb-3">Do</div>
            <ul className="space-y-2 text-[13.5px] leading-[1.55] text-[var(--color-cite)]">
              <li>Keep clearspace around the mark equal to one bracket height.</li>
              <li>Use the seal for round avatars and the app icon.</li>
              <li>Keep the token amber; keep everything else ink or white.</li>
            </ul>
          </div>
          <div className="rule-t rule-b rule-l rule-r p-6">
            <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-red-700 mb-3">Don&apos;t</div>
            <ul className="space-y-2 text-[13.5px] leading-[1.55] text-[var(--color-cite)]">
              <li>Recolor or gradient the token.</li>
              <li>Stretch, rotate, or add a drop shadow to the mark.</li>
              <li>Imply official endorsement by Anthropic or the MCP project.</li>
            </ul>
          </div>
        </div>
      </section>

      <p className="mt-10 font-mono text-[12px] text-[var(--color-mute)]">
        Questions? <ContactTrigger variant="contact" className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] inline cursor-pointer">Get in touch</ContactTrigger>
      </p>
    </article>
  );
}
