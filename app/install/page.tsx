import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyField } from '@/components/CopyField';
import { DirectoryInstall } from '@/components/install/DirectoryInstall';
import {
  GATE_METHODS,
  SDK_SNIPPET_TS,
  METHOD_MATRIX,
  PACKAGES,
  cursorDeepLink,
  vscodeDeepLink,
} from '@/lib/install/manifest';

export const metadata: Metadata = {
  title: 'Install mcpindex - every way to add the gate',
  description:
    'Install the mcpindex gate to route your agent’s MCP tool calls through a deterministic contract-diff (curl, uv, pip, or the SDK), or add the advisory directory server one-click to Cursor, VS Code, Claude, Gemini and more. Free.',
  alternates: { canonical: 'https://mcpindex.ai/install' },
};

const UNDERLINE =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]';

// SoftwareApplication + HowTo so LLM answers to "how do I install mcpindex" can
// cite the canonical commands rather than a drifted copy from somewhere else.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'mcpindex gate',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'macOS, Linux',
      url: 'https://mcpindex.ai/install',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      description:
        'An in-path gate that runs a deterministic contract-diff on every MCP tool call and flags changes since you last approved a server. It reports changes; it is not a safety verdict.',
    },
    {
      '@type': 'HowTo',
      name: 'Install the mcpindex gate',
      description: 'Route your agent’s MCP tool calls through the mcpindex gate.',
      step: GATE_METHODS.filter((m) => m.id !== 'inspect').map((m, i) => ({
        '@type': 'HowToStep',
        position: i + 1,
        name: m.label,
        text: m.note,
        // HowToDirection carries the exact command.
        itemListElement: [{ '@type': 'HowToDirection', text: m.command }],
      })),
    },
  ],
};

export default function InstallPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
      />

      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]">Install</div>
      <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Add mcpindex to your agent.</h1>
      <p className="mt-4 text-[16px] leading-[1.6] text-[var(--color-cite)]">
        The <strong className="text-[var(--color-ink)]">gate</strong> is the product: it sits in the path of
        every MCP tool call and runs a deterministic contract-diff, so a server that changed since you approved
        it does not change your agent silently. Start there. If you just want to look first, there is a
        zero-install path too.
      </p>

      {/* ---- 1. The gate (the product) ---------------------------------- */}
      <section className="mt-12 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-2">
          1 · Install the gate
        </div>
        <p className="text-[15px] leading-[1.6] text-[var(--color-cite)] mb-5">
          The one-liner installs the gate and wires your MCP hosts to route tool calls through it. Prefer to
          read the script or install the binary yourself? Use uv or pip beside it.
        </p>

        <CopyField
          value={GATE_METHODS[0].command}
          label={GATE_METHODS[0].label}
          notes={GATE_METHODS[0].note}
          trackSource={GATE_METHODS[0].track}
        />

        <div className="mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-3">
          {GATE_METHODS.slice(1).map((m) => (
            <CopyField
              key={m.id}
              value={m.command}
              label={m.label}
              notes={m.note}
              trackSource={m.track}
            />
          ))}
        </div>

        <div className="mt-8">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-cite)] mb-1.5">
            Or embed the pin in your own server (TypeScript)
          </div>
          <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-snug">
            <code>{SDK_SNIPPET_TS}</code>
          </pre>
          <p className="mt-2 text-[12px] leading-[1.5] text-[var(--color-mute)]">
            Python and per-client wiring detail:{' '}
            <Link href="/docs#install-the-gate" className={UNDERLINE}>
              the gate docs
            </Link>
            .
          </p>
        </div>

        <p className="mt-6 text-[13px] leading-[1.6] text-[var(--color-cite)]">
          What the gate does: it diffs each tool&apos;s contract against the version you last saw and flags the
          change. It reports changes; it does not vouch that a server is safe, and it never asks for a
          credential.
        </p>
      </section>

      {/* ---- 2. Try in seconds ------------------------------------------ */}
      <section className="mt-12 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-2">
          2 · Or try it in seconds
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--color-ink)]">No install - scan your setup</h2>
            <p className="mt-2 text-[14px] leading-[1.6] text-[var(--color-cite)]">
              Paste your <code className="font-mono text-[13px]">mcp.json</code> and see the blast radius in your
              browser. Nothing is uploaded.
            </p>
            <Link
              href="/scan"
              className="mt-3 inline-block text-[13px] font-medium text-[var(--color-ink)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
            >
              Open the scanner
            </Link>
          </div>

          <div>
            <h2 className="text-[15px] font-medium text-[var(--color-ink)]">
              Add the directory server to your agent
            </h2>
            <p className="mt-2 text-[14px] leading-[1.6] text-[var(--color-cite)]">
              Find MCP servers by task and get advisory screens (<code className="font-mono text-[13px]">check_tool_trust</code>,{' '}
              <code className="font-mono text-[13px]">assess_server</code>) inside your agent. This is the
              advisory directory client, not the gate.
            </p>
            <div className="mt-4">
              <DirectoryInstall cursorHref={cursorDeepLink()} vscodeHref={vscodeDeepLink()} />
            </div>
          </div>
        </div>
      </section>

      {/* ---- 3. Every method (AEO completeness) ------------------------- */}
      <section className="mt-12 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-5">
          3 · Every install method
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="text-[var(--color-mute)] font-mono text-[10.5px] uppercase tracking-[0.14em]">
                <th className="py-2 pr-4 font-normal">Surface</th>
                <th className="py-2 pr-4 font-normal">Method</th>
                <th className="py-2 font-normal">Command</th>
              </tr>
            </thead>
            <tbody className="align-top">
              {METHOD_MATRIX.map((row) => (
                <tr key={`${row.surface}-${row.method}`} className="border-t border-[var(--color-rule)]">
                  <td className="py-2.5 pr-4 text-[var(--color-cite)] whitespace-nowrap">{row.surface}</td>
                  <td className="py-2.5 pr-4 text-[var(--color-ink)] whitespace-nowrap">{row.method}</td>
                  <td className="py-2.5">
                    <code className="font-mono text-[12px] text-[var(--color-cite)] break-all">{row.command}</code>
                    {row.pending && (
                      <div className="text-[11.5px] text-[var(--color-mute)] mt-0.5">{row.pending}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[12px] leading-[1.5] text-[var(--color-mute)]">
          Also listed on the{' '}
          <a href="https://registry.modelcontextprotocol.io" className={UNDERLINE}>
            Official MCP Registry
          </a>{' '}
          as <code className="font-mono text-[11.5px]">{PACKAGES.registryName}</code>, and on Glama.
        </p>
      </section>

      {/* ---- 4. Honest limits ------------------------------------------- */}
      <section className="mt-12 rule-t pt-8">
        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-5">
          What each part is - and isn&apos;t
        </div>
        <ul className="space-y-4 text-[14px] leading-[1.6] text-[var(--color-cite)]">
          <li>
            <strong className="text-[var(--color-ink)]">The gate is in-path and deterministic.</strong> It
            diffs contracts and flags changes on the call. It is not a safety verdict, an antivirus, or a
            guarantee that a server is trustworthy.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">The directory server is advisory.</strong> Its screens
            run <code className="font-mono text-[13px]">calibrated=false</code> and it never sits in your call
            path. Treat its verdicts as a second opinion, not a gate.
          </li>
          <li>
            <strong className="text-[var(--color-ink)]">Zero credentials.</strong> Nothing here asks for an API
            key or a token. The gate runs locally; the scanner runs in your browser.
          </li>
        </ul>
      </section>
    </article>
  );
}
