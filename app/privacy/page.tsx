import type { Metadata } from 'next';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import { ObfuscatedEmail } from '@/components/ObfuscatedEmail';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy',
  description:
    'mcpindex.ai privacy policy: no third-party ad trackers; standard server logs kept 30 days for operations and security only; logs are not sold or shared.',
  path: '/privacy',
  image: '/opengraph-image',
});

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
        Last updated: 2026-07-20
      </p>

      <div className="mt-10 space-y-6 text-[14.5px] leading-[1.65] text-[var(--color-cite)]">
        <p>
          The site does not run third-party advertising trackers. Standard server logs
          (IP, user agent, request path, timestamp) are retained for 30 days for
          operational and security purposes only. Logs are not sold or shared.
        </p>
        <p>
          The contact and update-notification forms store your email and submission
          timestamp. They are used to reply about mcpindex (project updates, answers to your
          message) and nothing else. Your email is never sold, shared, or used to sell you
          anything, because there is nothing on sale. Unsubscribe at any time by emailing{' '}
          <ObfuscatedEmail
            user="hello"
            domain="mcpindex.ai"
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
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
          <span className="inline-code">mcpindex-gate</span> clients): <strong>off by
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
          Call receipts (the <span className="inline-code">mcpindex-gate</span> client):{' '}
          <strong>on by default</strong>. After each gated tool call the gate emits a compact,
          credential-blind receipt. Here is the complete list of what a receipt contains: a
          random receipt id; the tool contract hash (a sha256 of the tool&rsquo;s public
          contract); the gate verdict; a closed-vocabulary action classification (read / write
          / execute class, resource kind, reversibility); a closed-vocabulary run context
          (autonomy level, task-intent class, a human-in-the-loop flag, framework name); a
          closed-vocabulary outcome (status, side-effect class, a reverted flag, a coarse
          latency bucket); a yes/no/unclear &ldquo;justified&rdquo; flag; and a timestamp
          rounded to the hour. Every field is an enum from a fixed list, a hash, or a boolean -
          by construction there is <strong>no field that can hold free text</strong>, so a
          receipt <strong>never</strong> contains tool arguments, results, prompts, server
          names, or URLs. The ingest schema is strict and rejects anything else.
        </p>
        <p>
          What the hash lets us do, stated plainly: receipts include the tool contract hash,
          which we can match to servers in our public index. That tells us{' '}
          <em>which indexed tools an install gates</em> - never what you did with them, and
          nothing for tools we have not indexed. Receipts are linked by a random per-install
          token (<span className="inline-code">install_id</span>) generated on first run and
          stored locally. It is <strong>pseudonymous, not anonymous</strong>: it is a random
          token not derived from you or your machine and is never joined to your IP, but it
          does link one install&rsquo;s receipts together over time. Keyless installs have no
          account link; if you sign in and configure an{' '}
          <span className="inline-code">api_key</span>, receipts from that install are
          associated with your key. Set{' '}
          <span className="inline-code">MCPINDEX_RECEIPT_INGEST_ENABLED=0</span> to suppress
          receipt egress entirely; your per-install call log is visible (to anyone holding the
          token) at <span className="inline-code">mcpindex.ai/receipts?id=&lt;install-id&gt;</span>.
        </p>
        <p>
          First-run disclosure: from gate <strong>v0.9.0</strong>, the first run on a machine
          prints a one-line notice of exactly this behavior to stderr and sends{' '}
          <strong>nothing</strong> that session - emission starts on run 2, so no receipt is
          sent before the disclosure and the opt-out were visible. Earlier gate versions emit
          without the runtime notice, per the packaging README. The gate&rsquo;s other local
          lines (the ambient &ldquo;noted&rdquo; lines and the weekly summary line) are
          rendered from local state and send nothing anywhere.
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
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
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
            className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
          />{' '}
          to request deletion of any personal data tied to you.
        </p>
      </div>
      <Figure id="trust-boundary">{renderDiagram('trust-boundary')}</Figure>
    </article>
  );
}
