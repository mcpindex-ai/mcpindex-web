import type { Metadata } from 'next';
import { ContactTrigger } from '@/components/ContactModal';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Privacy policy for mcpindex.ai.',
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-[760px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Privacy
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Privacy.
      </h1>
      <p className="mt-2 font-mono text-[11.5px] text-[var(--color-mute)]">
        Last updated: 2026-04-30
      </p>

      <div className="mt-10 space-y-6 text-[14.5px] leading-[1.65] text-[var(--color-cite)]">
        <p>
          The site does not run third-party advertising trackers. Standard server logs
          (IP, user agent, request path, timestamp) are retained for 30 days for
          operational and security purposes only. Logs are not sold or shared.
        </p>
        <p>
          The waitlist and the Pro / Enterprise contact forms store the email you submit
          (plus any company name or message you include) so we can reach you about access
          and ship updates - nothing else. We process and store these through{' '}
          <a href="https://www.brevo.com/legal/privacypolicy/" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]">
            Brevo
          </a>
          , our email provider, who sends you a confirmation and may send those updates.
          We do not sell your details or use them for third-party advertising. Unsubscribe
          any time via the link in those emails, or{' '}
          <ContactTrigger variant="contact" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] inline cursor-pointer">
            contact us
          </ContactTrigger>
          .
        </p>
        <p>
          API requests to <span className="inline-code">/api/v1/*</span> are not logged
          beyond aggregate rate-limit counters. We do not log query strings. We do not
          persist task descriptions sent to the recommend endpoint.
        </p>
        <p>
          One scoped exception: the tool screener
          (<span className="inline-code">/api/v1/screen</span>). The description you paste is
          screened in-flight and is <strong>not stored</strong> unless you explicitly check
          &ldquo;Contribute this example to improve detection.&rdquo; If you check it, we store
          only that description and its verdict - no IP address, no other identifiers - to
          improve detection. Leave it unchecked and nothing is retained.
        </p>
        <p>
          Cookies: none are set by the site itself. Vercel may set a single platform cookie
          for routing.
        </p>
        <p>
          GDPR / CCPA:{' '}
          <ContactTrigger variant="contact" className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)] inline cursor-pointer">
            contact us
          </ContactTrigger>{' '}
          to request deletion of any personal data tied to you.
        </p>
      </div>
    </article>
  );
}
