import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { CopyField } from '@/components/CopyField';
import { DirectoryInstall } from '@/components/install/DirectoryInstall';
import { jsonLdSafe } from '@/lib/jsonLd';
import {
  GATE_METHODS,
  SDK_SNIPPET_TS,
  METHOD_MATRIX,
  PACKAGES,
  cursorDeepLink,
  vscodeDeepLink,
} from '@/lib/install/manifest';

export const metadata: Metadata = pageMetadata({
  title: 'Install mcpindex - every way to add the gate',
  description:
    'Install the mcpindex gate to route your agent’s MCP tool calls through a deterministic contract-diff (curl, uv, pip, or the SDK), or add the advisory directory server one-click to Cursor, VS Code, Claude, Gemini and more. Free.',
  path: '/install',
  image: '/opengraph-image',
});

const UNDERLINE =
  'underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]';

const KICKER = 'font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)]';

// SoftwareSourceCode + HowTo so LLM answers to "how do I install mcpindex" can
// cite the canonical commands rather than a drifted copy from somewhere else.
// SoftwareSourceCode (not SoftwareApplication) keeps this out of Google's app
// rich-result program, which requires a user rating we cannot honestly supply.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareSourceCode',
      name: 'mcpindex gate',
      url: 'https://mcpindex.ai/install',
      codeRepository: 'https://github.com/mcpindex-ai/mcpindex-web',
      runtimePlatform: 'Node.js',
      isAccessibleForFree: true,
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
        itemListElement: [{ '@type': 'HowToDirection', text: m.command }],
      })),
    },
  ],
};

const INSPECT = GATE_METHODS.find((m) => m.id === 'inspect')!;
const UV = GATE_METHODS.find((m) => m.id === 'uv')!;
const PIP = GATE_METHODS.find((m) => m.id === 'pip')!;

export default function InstallPage() {
  return (
    <article className="site-container pt-16 pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdSafe(JSON_LD) }}
      />

      {/* Reading column: constrain the measure so prose and command boxes
          don't run the full 1180px shell (that hurt readability at launch). */}
      <div className="max-w-[46rem]">
        <div className={KICKER}>Install</div>
        <h1 className="mt-3 t-page-h1 font-medium text-[var(--color-ink)]">Add mcpindex to your agent.</h1>
        <p className="mt-4 text-[16px] leading-[1.65] text-[var(--color-cite)]">
          The <strong className="text-[var(--color-ink)]">gate</strong>{' '}is the product. It sits in the path of
          every MCP tool call and runs a deterministic contract-diff, so a server whose contract changed
          since you approved it can&apos;t silently change the tools your agent sees. Start there. If you just
          want to look first, there is a zero-install path too.
        </p>

        {/* Bridge to the narrated onboarding for the learner who wants the whole
            path + the payoff (a HOLD) before committing. Reference stays below. */}
        <Link
          href="/guides/install-the-gate-first-hold"
          className="group mt-6 flex items-center justify-between gap-4 rule-t rule-b rule-l rule-r p-4 transition-colors hover:bg-[var(--color-accent-soft)]"
        >
          <span>
            <span className={KICKER}>New here?</span>
            <span className="mt-1 block text-[15px] font-medium text-[var(--color-ink)]">
              Walk through install and watch your first HOLD
            </span>
            <span className="mt-0.5 block text-[13px] text-[var(--color-mute)]">
              A ~4-minute guided path, with the live drift demo, before you commit.
            </span>
          </span>
          <span
            aria-hidden
            className="font-mono text-[16px] text-[var(--color-accent)] transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>

        {/* ---- 1. The gate (the product) -------------------------------- */}
        <section className="mt-14 rule-t pt-8">
          <div className={`${KICKER} mb-2`}>1 · Install the gate</div>
          <p className="text-[15px] leading-[1.65] text-[var(--color-cite)] mb-5">
            The one-liner installs the gate and wires your MCP hosts to route tool calls through it. Prefer to
            install the binary yourself? Use uv or pip below.
          </p>

          <CopyField
            value={GATE_METHODS[0].command}
            label={GATE_METHODS[0].label}
            notes={GATE_METHODS[0].note}
            trackSource={GATE_METHODS[0].track}
          />

          <p className="mt-3 text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
            Rather read it first?{' '}
            <code className="font-mono text-[12px] text-[var(--color-cite)]">{INSPECT.command}</code> pipes the
            script to your pager. <code className="font-mono text-[12px]">uninstall.sh</code> restores the
            original config.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[UV, PIP].map((m) => (
              <CopyField
                key={m.id}
                value={m.command}
                label={m.label}
                notes={m.note}
                trackSource={m.track}
              />
            ))}
          </div>

          <p className="mt-3 text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
            The PyPI package is{' '}
            <code className="font-mono text-[12px] text-[var(--color-cite)]">mcpindex-gate</code>.
            An unrelated third-party package named{' '}
            <code className="font-mono text-[12px]">mcp-index</code> exists on PyPI and is not us.
          </p>

          <div className="mt-8">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-cite)] mb-1.5">
              Or embed the pin in your own server (TypeScript)
            </div>
            <pre className="bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] overflow-x-auto leading-relaxed">
              <code>{SDK_SNIPPET_TS}</code>
            </pre>
            <p className="mt-2 text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
              Python SDK, manual host-config wiring, and how the gate works:{' '}
              <Link href="/docs#install-the-gate" className={UNDERLINE}>
                the gate docs
              </Link>
              .
            </p>
          </div>

          <p className="mt-7 text-[13.5px] leading-[1.65] text-[var(--color-cite)] border-l-2 border-[var(--color-rule)] pl-4">
            What the gate does: it diffs each tool&apos;s contract against the version you last saw and flags the
            change. It reports changes; it does not vouch that a server is safe, and it never asks for a
            credential.
          </p>
        </section>

        {/* ---- 2. Try in seconds --------------------------------------- */}
        <section className="mt-14 rule-t pt-8">
          <div className={`${KICKER} mb-2`}>2 · Or try it in seconds</div>

          <p className="text-[15px] leading-[1.65] text-[var(--color-cite)]">
            Not ready to wire the gate in?{' '}
            <Link href="/scan" className={`${UNDERLINE} text-[var(--color-ink)] font-medium`}>
              Scan your <code className="font-mono text-[13px]">mcp.json</code>
            </Link>{' '}
            to see the blast radius in your browser (nothing is uploaded), or add the advisory directory server
            to your agent below.
          </p>

          <div className="mt-6 rule-t rule-b rule-l rule-r bg-white p-5">
            <h2 className="text-[15px] font-medium text-[var(--color-ink)]">
              Add the directory server to your agent
            </h2>
            <p className="mt-1.5 text-[13.5px] leading-[1.6] text-[var(--color-cite)]">
              Find MCP servers by task and get advisory screens (
              <code className="font-mono text-[13px]">check_tool_trust</code>,{' '}
              <code className="font-mono text-[13px]">assess_server</code>) inside your agent. This is the
              advisory directory client, not the gate.
            </p>
            <div className="mt-4">
              <DirectoryInstall cursorHref={cursorDeepLink()} vscodeHref={vscodeDeepLink()} />
            </div>
          </div>
        </section>

        {/* ---- 3. Every method (AEO completeness) ---------------------- */}
        <section className="mt-14 rule-t pt-8">
          <div className={`${KICKER} mb-4`}>3 · Every install method</div>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-left text-[13px] border-collapse">
              <thead>
                <tr className="text-[var(--color-mute)] font-mono text-[10.5px] uppercase tracking-[0.14em]">
                  <th className="py-2 pr-6 font-normal">Surface</th>
                  <th className="py-2 pr-6 font-normal">Method</th>
                  <th className="py-2 font-normal">Command</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {METHOD_MATRIX.map((row) => (
                  <tr key={`${row.surface}-${row.method}`} className="border-t border-[var(--color-rule)]">
                    <td className="py-2.5 pr-6 text-[var(--color-cite)] whitespace-nowrap">{row.surface}</td>
                    <td className="py-2.5 pr-6 text-[var(--color-ink)] whitespace-nowrap">{row.method}</td>
                    <td className="py-2.5">
                      <code className="font-mono text-[12px] text-[var(--color-cite)] whitespace-nowrap">
                        {row.command}
                      </code>
                      {row.pending && (
                        <div className="text-[11.5px] text-[var(--color-mute)] mt-0.5 whitespace-normal">
                          {row.pending}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[12.5px] leading-[1.55] text-[var(--color-mute)]">
            Also listed on the{' '}
            <a href="https://registry.modelcontextprotocol.io" className={UNDERLINE}>
              Official MCP Registry
            </a>{' '}
            as <code className="font-mono text-[11.5px]">{PACKAGES.registryName}</code>, and on Glama.
          </p>
        </section>

        {/* ---- 4. Honest limits ---------------------------------------- */}
        <section className="mt-14 rule-t pt-8">
          <div className={`${KICKER} mb-5`}>What each part is - and isn&apos;t</div>
          <dl className="space-y-5 text-[14px] leading-[1.65] text-[var(--color-cite)]">
            <div>
              <dt className="text-[var(--color-ink)] font-medium">The gate is in-path and deterministic.</dt>
              <dd className="mt-1">
                It diffs contracts and flags changes on the call. It is not a safety verdict, an antivirus, or a
                guarantee that a server is trustworthy.
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink)] font-medium">The directory server is advisory.</dt>
              <dd className="mt-1">
                Its screens run <code className="font-mono text-[13px]">calibrated=false</code> and it never
                sits in your call path. Treat its verdicts as a second opinion, not a gate.
              </dd>
            </div>
            <div>
              <dt className="text-[var(--color-ink)] font-medium">Zero credentials.</dt>
              <dd className="mt-1">
                Nothing here asks for an API key or a token. The gate runs locally; the scanner runs in your
                browser.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </article>
  );
}
