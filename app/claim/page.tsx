import Link from 'next/link';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Claim your server',
  description:
    'Prove you control your MCP server and request an owner-consented preview conformance badge on its mcpindex page. Only registry-listed servers with an HTTP remote are claimable. The badge is a preview observation ("no contract drift observed"), not a security or safety guarantee - owner-attested, subordinate to mcpindex screening, re-checked and revoked on drift.',
  path: '/claim',
});

// One curl/command block, styled like the /methodology "Cite this" block.
function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
      <code>{children}</code>
    </pre>
  );
}

// A numbered step: index, title, prose body, optional command block.
function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="rule-b py-6 px-2">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[12px] tabular-nums text-[var(--color-accent-strong)]">
          {String(n).padStart(2, '0')}
        </span>
        <span className="text-[15px] font-medium text-[var(--color-ink)]">{title}</span>
      </div>
      <div className="mt-2 pl-8 text-[14px] leading-[1.6] text-[var(--color-cite)]">
        {children}
      </div>
    </li>
  );
}

export default function ClaimPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">
        Owners · preview badge
      </div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">
        Prove you control your server.
      </h1>
      <p className="mt-5 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        If you operate an MCP server, you can prove you control it and request an
        owner-consented <strong className="text-[var(--color-ink)] font-medium">preview
        conformance badge</strong> on its mcpindex page. The badge reports a single
        observation - &ldquo;no contract drift observed&rdquo; on a read-only probe of the
        tools you attest. You verify domain control, attest which tools are read-only-safe,
        let mcpindex run a read-only behavioral check, and explicitly consent to publish. A
        human operator reviews before anything appears.
      </p>

      {/* What it is / isn't - matches the OwnerPreviewPanel wording on /server/<slug>. */}
      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          What the badge is - and is not
        </div>
        <ul className="space-y-3 text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">A preview observation, not a guarantee.</strong>{' '}
            It states what a read-only probe observed (&ldquo;no contract drift
            observed&rdquo;). It is not a certification and never asserts your server is
            safe, secure, or verified-safe. No such claim is made or implied.
          </li>
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">Owner-attested and consented.</strong>{' '}
            It is published at your request, on tools you attest as read-only, and
            human-confirmed by an mcpindex operator before it renders.
          </li>
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">Subordinate to screening.</strong>{' '}
            It lives on its own axis, below and separate from mcpindex&rsquo;s own screening
            verdict. It never overrides, upgrades, or substitutes for that verdict. See the{' '}
            <Link
              href="/methodology"
              className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
            >
              methodology
            </Link>
            .
          </li>
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">Re-checked, and revoked on drift.</strong>{' '}
            The observation is bound to the exact tool definitions you attested. If a
            contract drifts, the badge is re-checked and revoked - it is not a standing
            claim.
          </li>
          <li>
            <span className="text-[var(--color-accent-strong)] font-mono">·</span>{' '}
            <strong className="text-[var(--color-ink)] font-medium">Preview, and evolving.</strong>{' '}
            This flow and the read-only probe are still being tuned. Treat the badge as a
            preview signal, not a finished product.
          </li>
        </ul>
      </section>

      {/* Eligibility - only remote-having, registry-listed servers are claimable. */}
      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Who can claim
        </div>
        <p className="text-[14.5px] leading-[1.6] text-[var(--color-cite)]">
          Only a server that is <strong className="text-[var(--color-ink)] font-medium">listed
          in the MCP registry</strong> and exposes an{' '}
          <strong className="text-[var(--color-ink)] font-medium">HTTP remote</strong> can be
          verified this way. Verification proves you control the origin of that remote URL, so
          a package-only or stdio-only server (no reachable HTTP origin) cannot be claimed
          through this flow. If your server page shows a remote endpoint, you can claim it.
        </p>
      </section>

      {/* The flow - numbered, copy-paste curl. */}
      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-2">
          The flow
        </div>
        <p className="text-[13.5px] leading-[1.6] text-[var(--color-mute)]">
          Every request goes to <span className="font-mono text-[var(--color-cite)]">https://owner.mcpindex.ai</span> and
          carries your api_key as a bearer token. Replace{' '}
          <span className="font-mono text-[var(--color-cite)]">io.github.you/your-server</span> with
          your server&rsquo;s registry name.
        </p>

        <ol className="rule-t mt-6">
          <Step n={1} title="Get a free api_key">
            <p>
              Sign in with GitHub or Google via the self-serve login. It mints a free api_key
              and stores it at{' '}
              <span className="font-mono text-[13px]">~/.mcpindex/credentials.json</span>. The
              login lives in the{' '}
              <a
                href="https://www.npmjs.com/package/@mcp-index/sdk"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent-strong)]"
              >
                @mcp-index/sdk
              </a>{' '}
              CLI.
            </p>
            <Code>{`npx -p @mcp-index/sdk mcpindex login          # GitHub (default)
npx -p @mcp-index/sdk mcpindex login --provider google

# then export it for the calls below:
export MCPINDEX_API_KEY="$(node -e "process.stdout.write(require(require('os').homedir()+'/.mcpindex/credentials.json').api_key)")"`}</Code>
          </Step>

          <Step n={2} title="Request a challenge">
            <p>
              Ask for a one-time token bound to your server. It is valid for 15 minutes.
            </p>
            <Code>{`curl -sX POST https://owner.mcpindex.ai/owner/challenge \\
  -H "Authorization: Bearer $MCPINDEX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"server_id":"io.github.you/your-server"}'

# -> {"token":"<token>",
#     "well_known_path":"/.well-known/mcpindex-challenge",
#     "expires_at":"<iso8601>"}   # 15-minute TTL`}</Code>
          </Step>

          <Step n={3} title="Prove control of the origin">
            <p>
              Serve the exact token as plain text at{' '}
              <span className="font-mono text-[13px]">/.well-known/mcpindex-challenge</span> on
              the origin of your server&rsquo;s remote URL. If your remote is{' '}
              <span className="font-mono text-[13px]">https://mcp.example.com/sse</span>, the
              token must be readable at{' '}
              <span className="font-mono text-[13px]">https://mcp.example.com/.well-known/mcpindex-challenge</span>.
            </p>
          </Step>

          <Step n={4} title="Verify ownership">
            <p>
              mcpindex fetches the well-known path and checks the token matches. This only
              records proof of control - it opens no public badge.
            </p>
            <Code>{`curl -sX POST https://owner.mcpindex.ai/owner/verify-ownership \\
  -H "Authorization: Bearer $MCPINDEX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"server_id":"io.github.you/your-server"}'

# -> {"authorized":true}`}</Code>
          </Step>

          <Step n={5} title="Get your tools' hashes">
            <p>
              With the ownership grant from the previous step, ask mcpindex for your
              server&rsquo;s live tools and the exact{' '}
              <span className="font-mono text-[13px]">definition_hash</span> it computes for
              each. This is a GET, authorized with your api_key - it hands you the values you
              would otherwise have to compute.
            </p>
            <Code>{`curl -s https://owner.mcpindex.ai/owner/tools/io.github.you/your-server \\
  -H "Authorization: Bearer $MCPINDEX_API_KEY"

# -> {"server_id":"io.github.you/your-server",
#     "as_of":"<iso8601>",
#     "tools":[
#       {"name":"search",
#        "definition_hash":"sha256:<64-hex>",
#        "probe_safe":true},
#       ...]}`}</Code>
            <p className="mt-3">
              Each entry is a tool mcpindex currently observes live on your server, paired with
              the exact <span className="font-mono text-[13px]">definition_hash</span> it will
              match against - so you no longer compute the sha256 yourself. The{' '}
              <span className="font-mono text-[13px]">probe_safe</span> flag is a heuristic hint
              of whether the tool looks read-only, i.e. safe to send malformed test input to.
              Attest just the tools where{' '}
              <span className="font-mono text-[13px]">probe_safe: true</span>, copying their{' '}
              <span className="font-mono text-[13px]">name</span> and{' '}
              <span className="font-mono text-[13px]">definition_hash</span> verbatim into the
              next step. If your server is unobservable, the response returns an empty{' '}
              <span className="font-mono text-[13px]">tools</span> list with a note.
            </p>
            <p className="mt-3">
              <strong className="text-[var(--color-ink)] font-medium">Honest caveat:</strong>{' '}
              <span className="font-mono text-[13px]">probe_safe</span> is a heuristic hint, not
              a guarantee - you confirm read-only-ness yourself, and record that human judgment
              in the attestation tag in the next step.
            </p>
          </Step>

          <Step n={6} title="Attest your read-only tools">
            <p>
              List just the{' '}
              <strong className="text-[var(--color-ink)] font-medium">read-only tools</strong>{' '}
              you selected above - the ones safe to probe with malformed input. mcpindex probes
              nothing you do not attest, and re-checks the read-only heuristic on its side: a
              write, payment, or destructive tool is refused regardless. Each tool carries four
              fields; the first two are copied straight from the{' '}
              <span className="font-mono text-[13px]">/owner/tools</span> response above.
            </p>
            <ul className="mt-3 space-y-2">
              <li>
                <span className="font-mono text-[13px] text-[var(--color-ink)]">name</span> - the
                tool&rsquo;s advertised name, copied from the{' '}
                <span className="font-mono text-[13px]">/owner/tools</span> response.
              </li>
              <li>
                <span className="font-mono text-[13px] text-[var(--color-ink)]">definition_hash</span>{' '}
                - copied verbatim from that same{' '}
                <span className="font-mono text-[13px]">/owner/tools</span> response. It is the
                sha256 of the tool&rsquo;s definition as mcpindex sees it live; because it came
                from mcpindex, it matches mcpindex&rsquo;s own computed hash, so the tool is not
                skipped from the behavioral check. You no longer compute it yourself.
              </li>
              <li>
                <span className="font-mono text-[13px] text-[var(--color-ink)]">attestation</span>{' '}
                - a human attestation tag of the form{' '}
                <span className="font-mono text-[13px]">
                  probe-attest-&lt;date&gt;-&lt;label&gt;-human-&lt;who&gt;
                </span>
                . It must contain{' '}
                <span className="font-mono text-[13px]">-human-</span>; machine or self tags are
                rejected. It records that a human confirmed these tools are read-only-safe to
                probe.
              </li>
              <li>
                <span className="font-mono text-[13px] text-[var(--color-ink)]">confirmed_by</span>{' '}
                - who confirmed.
              </li>
            </ul>
            <Code>{`curl -sX POST https://owner.mcpindex.ai/owner/attest \\
  -H "Authorization: Bearer $MCPINDEX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"server_id":"io.github.you/your-server",
       "probe_safe_tools":[{"name":"search",
         "definition_hash":"sha256:<64-hex-copied-from-/owner/tools>",
         "attestation":"probe-attest-2026-07-19-search-human-confirmed",
         "confirmed_by":"you@example.com"}]}'`}</Code>
          </Step>

          <Step n={7} title="Run the behavioral check">
            <p>
              mcpindex runs a read-only conformance probe against the tools you attested,
              checking whether observed behavior matches the definitions you pinned. This is a
              preview probe, still being tuned: its result feeds only the owner preview
              observation and never graduates the public screen verdict, which stays
              semantic-only until the D3 milestone.
            </p>
            <Code>{`curl -sX POST https://owner.mcpindex.ai/owner/verify-behavior \\
  -H "Authorization: Bearer $MCPINDEX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"server_id":"io.github.you/your-server"}'`}</Code>
          </Step>

          <Step n={8} title="Request publish (consent)">
            <p>
              Explicitly consent to publish the preview observation. Nothing is published
              without <span className="font-mono text-[13px]">consent_publish: true</span>.
            </p>
            <Code>{`curl -sX POST https://owner.mcpindex.ai/owner/publish \\
  -H "Authorization: Bearer $MCPINDEX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"server_id":"io.github.you/your-server","consent_publish":true}'`}</Code>
          </Step>

          <Step n={9} title="mcpindex reviews, then it may appear">
            <p>
              A human operator reviews the request. If it is published, an{' '}
              <strong className="text-[var(--color-ink)] font-medium">Owner preview</strong>{' '}
              panel appears on your server&rsquo;s page, clearly marked as a preview
              observation and subordinate to the screening verdict. It is re-checked over time
              and revoked if the contract drifts.
            </p>
          </Step>
        </ol>
      </section>

      {/* Links out. */}
      <section className="mt-12 rule-t pt-10">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
          Start here
        </div>
        <div className="flex flex-col gap-3 font-mono text-[12px] uppercase tracking-[0.14em]">
          <a
            href="https://www.npmjs.com/package/@mcp-index/sdk"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
          >
            Get a free api_key (self-serve login) →
          </a>
          <a
            href="https://owner.mcpindex.ai"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]"
          >
            owner.mcpindex.ai (the owner API) →
          </a>
          <Link href="/search" className="text-[var(--color-cite)] hover:text-[var(--color-accent-strong)]">
            Find your server in the index →
          </Link>
        </div>
      </section>
    </article>
  );
}
