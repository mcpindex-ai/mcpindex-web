import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Privacy policy for mcpindex.ai.',
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-[720px] px-6 sm:px-10 pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[--color-mute]">
        §01&nbsp;&nbsp;Privacy
      </div>
      <h1 className="mt-3 text-[36px] sm:text-[44px] tracking-[-0.02em] leading-[1.05] font-medium text-[--color-ink]">
        Privacy.
      </h1>
      <p className="mt-2 font-mono text-[11.5px] text-[--color-mute]">
        Last updated: 2026-04-30
      </p>

      <div className="mt-10 space-y-6 text-[14.5px] leading-[1.65] text-[--color-cite]">
        <p>
          The site does not run third-party advertising trackers. Standard server logs
          (IP, user agent, request path, timestamp) are retained for 30 days for
          operational and security purposes only. Logs are not sold or shared.
        </p>
        <p>
          The waitlist form stores your email and submission timestamp. We use it to
          notify you when v1 ships and nothing else. Unsubscribe at any time by emailing{' '}
          <a href="mailto:hello@mcpindex.ai" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            hello@mcpindex.ai
          </a>
          .
        </p>
        <p>
          API requests to <span className="inline-code">/api/v1/*</span> are not logged
          beyond aggregate rate-limit counters. We do not log query strings. We do not
          persist task descriptions sent to the recommend endpoint.
        </p>
        <p>
          Cookies: none are set by the site itself. Vercel may set a single platform cookie
          for routing.
        </p>
        <p>
          GDPR / CCPA: email{' '}
          <a href="mailto:hello@mcpindex.ai" className="underline decoration-[--color-rule] underline-offset-4 hover:text-[--color-accent]">
            hello@mcpindex.ai
          </a>{' '}
          to request deletion of any personal data tied to you.
        </p>
      </div>
    </article>
  );
}
