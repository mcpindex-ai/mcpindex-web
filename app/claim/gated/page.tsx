// Why an OAuth-protected server reaches step 03 and sees an empty tool list.
//
// WHY THIS PAGE EXISTS. Two owners of gated servers completed domain verification, hit an
// empty tool list, and had to read our source to work out why. Both were correct about the
// cause. A wall people discover by hitting it is a documentation bug, not a support queue.
//
// It also publishes the gated-population census (tasks/growth/gated-oauth-census-2026-08-04.md)
// because the honest answer to "just follow the OAuth discovery flow" is a measurement, and
// asserting it without the number would be exactly the kind of unevidenced claim the
// methodology page refuses elsewhere.
import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  image: '/opengraph-image',
  title: 'OAuth-protected servers and the owner badge',
  description:
    'Why a server that requires OAuth reaches the tools step of the owner flow and sees an empty list, what it still gets (listing, screening, a durable ownership proof), and why mcpindex will not complete a conformance badge it never ran. Includes the measured gated-server census: 96% advertise dynamic client registration, 3.5% can issue a token without a human.',
  path: '/claim/gated',
});

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-12 rule-t pt-10">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        {label}
      </div>
      {children}
    </section>
  );
}

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
    >
      {children}
    </Link>
  );
}

// The census table. Figures are the seeded random sample (seed 20260804, n=1200 remotes);
// see the honest-limits note below the table - they are advertised capability, not
// demonstrated token issuance.
const CENSUS: ReadonlyArray<readonly [string, string, string]> = [
  ['Remotes probed', '1,200', 'seeded random sample of the registry'],
  ['Answered 401 (gated)', '315', '26.3% of those probed'],
  ['Carried an RFC 9728 pointer', '161', '51% of gated servers'],
  ['Authorization-server metadata readable', '142', ''],
  ['Advertised dynamic client registration', '136', '96% of those 142'],
  ['Actually supported client_credentials', '5', '3.5% of those 142'],
];

export default function GatedClaimPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Owners · preview badge · OAuth
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Your server requires OAuth, so the tools step is empty.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        If you proved you control your server and then reached the tools step of the{' '}
        <A href="/claim">owner flow</A> to find nothing listed, this page is the explanation.
        Nothing is misconfigured on your side. mcpindex cannot currently read the tool list of
        a server that requires authentication, and we would rather say so plainly than leave
        you reading our source to work it out.
      </p>

      <Section label="What is actually happening">
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          The owner flow asks your server for its tool list over an unauthenticated request.
          Your server answers <strong className="text-[var(--color-ink)] font-medium">401</strong>,
          correctly, because that is what a protected resource is supposed to do. The flow
          carries no credential at that step, so it observes no tools, and with no tools there
          is nothing for you to attest and nothing for the conformance check to run against.
          The wall is at discovery, not at your OAuth configuration.
        </p>
      </Section>

      <Section label="What you already have">
        <ul className="space-y-3 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">Your listing and screening are unaffected.</strong>{' '}
            mcpindex screens the registry description, which needs no access to your live
            server. If your page shows a screening verdict, that verdict is real and the 401
            never touched it.
          </li>
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">Your ownership proof is on file and does not expire.</strong>{' '}
            The endpoint challenge you completed is recorded and hash-chained. You will not be
            asked to prove ownership again when the authenticated path exists.
          </li>
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">What is missing is only the badge.</strong>{' '}
            The badge is a different claim from the listing. It reports what a read-only probe
            observed when mcpindex sent live bytes to the tools you attested.
          </li>
        </ul>
      </Section>

      <Section label="Why we will not just complete it by hand">
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          We could mark your claim complete without running anything. We will not. The badge
          states that a check was performed and reports its result; through a 401 there are no
          observed bytes, so there is no result to report. A badge that says a check passed
          when no check happened is worth less than no badge, and it would quietly devalue the
          badge for every other owner who did earn one. Leaving yours empty and explaining why
          is the honest option. See the <A href="/methodology">methodology</A> for the same
          standard applied elsewhere.
        </p>
      </Section>

      <Section label="Why the standard OAuth discovery flow is not the fix">
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          The obvious suggestion, and the one we get, is to have the probe follow OAuth
          discovery and register itself as a client. We measured whether that would work
          before deciding against it.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-[13.5px] leading-[1.55] text-[var(--color-cite)]">
            <tbody>
              {CENSUS.map(([label, n, note]) => (
                <tr key={label} className="rule-b">
                  <td className="py-2 pr-4 align-baseline">{label}</td>
                  <td className="py-2 pr-4 align-baseline font-mono tabular-nums text-[var(--color-ink)] whitespace-nowrap">
                    {n}
                  </td>
                  <td className="py-2 align-baseline text-[var(--color-mute)]">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          Nearly every gated server advertises that a client may register itself. Almost none
          will then issue a token to a machine with no person present, because they support
          only <span className="font-mono text-[13px]">authorization_code</span> and{' '}
          <span className="font-mono text-[13px]">refresh_token</span>. A probe that followed
          discovery faithfully would register successfully and then stop, needing a human to
          consent in a browser. Building it would move the dead end one hop later rather than
          remove it, and would leave mcpindex holding a client secret we do not want.
        </p>
        <p className="mt-4 text-[13px] leading-[1.6] text-[var(--color-mute)]">
          Honest limits: <span className="font-mono text-[12px]">grant_types_supported</span>{' '}
          is itself an advertisement. No token was requested from any server, so 3.5% is an
          upper bound on advertised capability rather than demonstrated issuance. The
          percentage is a share of the 142 servers whose metadata was readable, not of all 315
          gated servers. Single vantage, single moment, no retry for transient failures.
        </p>
      </Section>

      <Section label="What the supported path will be">
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          A short-lived token you mint, used once to read your tool list and run the read-only
          behavioral check, never stored, never logged, and never able to call a tool. mcpindex
          does not want custody of anything long-lived and will not become a registered OAuth
          client holding a secret. Both owners who raised this proposed roughly the same
          mechanism independently, which is a good sign it is the right one.
        </p>
        <p className="mt-4 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          We are not publishing a date. When it exists, this page changes.
        </p>
      </Section>

      <Section label="What such a badge could and could not mean">
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          Worth knowing before you invest effort in it. A badge earned through a credential you
          supplied is a{' '}
          <strong className="text-[var(--color-ink)] font-medium">single dated observation</strong>,
          and it decays differently from one on an open server. For an open server, mcpindex
          re-checks continuously and revokes the badge on drift. For a gated server we cannot
          re-check, because the credential was deliberately never kept, so the badge simply
          expires on its normal schedule and you re-run the check if you still want one.
        </p>
        <p className="mt-4 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          That asymmetry is real and we would rather state it up front than have you discover
          it later. It is also why the wording on every preview badge is
          &ldquo;no contract drift observed&rdquo; as of a date, never that a server is safe,
          secure, or conforming.
        </p>
      </Section>

      <Section label="If this is you">
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          Nothing is required of you right now. Your listing stands, your screening verdict
          stands, and your ownership proof is kept. If you want to be told when the
          authenticated path lands, mail{' '}
          <a
            href="mailto:hello@mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          >
            hello@mcpindex.ai
          </a>{' '}
          and we will write to you when it does rather than when we hope it might.
        </p>
      </Section>
    </article>
  );
}
