import type { Metadata } from 'next';
import { ObfuscatedEmail } from '@/components/ObfuscatedEmail';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'Privacy policy for mcpindex.ai.',
  alternates: { canonical: 'https://mcpindex.ai/privacy' },
};

export default function PrivacyPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Privacy
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Privacy.
      </h1>
      <p className="mt-2 font-mono text-[11.5px] text-[var(--color-mute)]">
        Last updated: 2026-07-12
      </p>

      <div className="mt-10 space-y-6 text-[14.5px] leading-[1.65] text-[var(--color-cite)]">
        <p>
          The site does not run third-party advertising trackers. Standard server logs
          (IP, user agent, request path, timestamp) are retained for 30 days for
          operational and security purposes only. Logs are not sold or shared.
        </p>
        <p>
          The waitlist and contact forms store your email and submission timestamp. We use
          them to reply about mcpindex (product updates, answers to your message) and nothing
          else. Unsubscribe at any time by emailing{' '}
          <ObfuscatedEmail
            user="hello"
            domain="mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          />
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
          Drift telemetry (the <span className="inline-code">@mcp-index/sdk</span> /{' '}
          <span className="inline-code">mcpindex-preflight</span> clients): <strong>off by
          default</strong>. The SDK sends <strong>nothing</strong> unless you set{' '}
          <span className="inline-code">MCPINDEX_DRIFT_TELEMETRY=detection</span>. When enabled,
          a tool-pin or a contract drift sends one one-way signal to{' '}
          <span className="inline-code">/api/v1/drift</span>: salted (HMAC) fingerprints of the
          server/tool id, the contract hashes, the change type, a safety flag, an
          hour-rounded time, and the client SDK tag (<span className="inline-code">py</span> or{' '}
          <span className="inline-code">ts</span>) - plus a random install id that links one
          machine&rsquo;s signals so we can count distinct installs (it is a random token, not
          derived from you, and is never joined to your IP). Under the same flag, the gate also
          makes a read-only query to <span className="inline-code">/api/v1/drift/any</span> to ask
          whether a tool&rsquo;s contract already drifted, so it can warn you on the first call;
          that query sends only a salted fingerprint. It <strong>never</strong> sends tool schemas,
          arguments, descriptions, URLs, or server/tool names. (<span className="inline-code">detection</span>{' '}
          enables the signal above; <span className="inline-code">contribute</span> is reserved for
          a future richer tier and behaves identically today.) Unset the variable to stop.
        </p>
        <p>
          Cookies and similar storage: the site itself does not set first-party advertising
          cookies. Hosting on Vercel may set a platform routing cookie. We also load{' '}
          <strong>Vercel Analytics</strong> and <strong>Vercel Speed Insights</strong>, which
          may use cookies or local storage for aggregated, privacy-oriented traffic and
          performance metrics (no advertising profile). See{' '}
          <a
            href="https://vercel.com/docs/analytics/privacy-policy"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          >
            Vercel Analytics privacy
          </a>
          . This is our cookie notice for launch; we do not run a separate consent banner
          because we do not use advertising trackers.
        </p>
        <p>
          GDPR / CCPA: email{' '}
          <ObfuscatedEmail
            user="hello"
            domain="mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
          />{' '}
          to request deletion of any personal data tied to you.
        </p>
      </div>
    </article>
  );
}
