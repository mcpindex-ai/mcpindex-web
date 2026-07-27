import type { ReactNode } from 'react';
import { CopyField } from '@/components/CopyField';
import { Figure } from '@/components/Figure';
import { renderDiagram } from '@/components/diagrams';
import { getDiagram } from '@/lib/diagrams';
import DriftGateDemo from '@/components/DriftGateDemo';
import { ScanTool } from '@/components/ScanTool';
import { Disclose } from '@/components/Disclose';
import { GuideHostPicker } from '@/components/GuideHostPicker';
import {
  CURL_INSTALL,
  UV_INSTALL_WIRED,
  INSPECT_INSTALL,
  GATE_WIRING_HOSTS,
  DIRECTORY_CLIENTS,
  PACKAGES,
} from '@/lib/install/manifest';

/**
 * The ONE coupling point between walkthrough guides and the live product.
 *
 * A guide step names an embed by string key; this registry maps the key to a
 * render of the REAL shipping component or a fact single-sourced from lib/. That
 * is what makes the walkthroughs self-maintaining instead of screenshot-rotting:
 * the install command comes from lib/install/commands.ts, the wired-host list
 * from GATE_WIRING_HOSTS, the drift demo IS the homepage component. When a
 * feature changes those sources, the guide updates with zero hand-edits.
 *
 * This module is SERVER-side (rendered inside the RSC guide page). It may import
 * lib/install/manifest (arrays + deep-link code) freely; the interactive host
 * picker is a client island that receives plain data as PROPS, so the manifest
 * never crosses into the browser bundle (see the manifest header + the picker).
 *
 * HONESTY (build-guarded by scripts/check-graduation-honesty.mjs): copy here must
 * respect the live vocabulary - the gate HOLDs/PROCEEDs on a contract-DIFF (not a
 * safety verdict); the directory server + screen are advisory (REVIEW/UNVERIFIED).
 */

export type EmbedKey =
  | 'install-command'
  | 'login-command'
  | 'supported-hosts'
  | 'host-picker'
  | 'drift-gate-demo'
  | 'scan-tool'
  | 'ambient-trace'
  | 'verdict-states';

interface Embed {
  /** One line on what this embed shows / why it's here (for the registry index). */
  note: string;
  render: () => ReactNode;
}

const KICKER = 'font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]';

export const EMBED_REGISTRY: Record<EmbedKey, Embed> = {
  'install-command': {
    note: 'The one-liner that installs the gate and wires every MCP host (from lib/install/commands.ts). The auditable uv path leads; the install script is collapsed underneath.',
    render: () => (
      <div className="mt-5">
        <CopyField value={UV_INSTALL_WIRED} trackSource="guide-install-uv" />
        <Disclose summary="Prefer the one-script install?" className="mt-3">
          <p className="mt-0">
            The install script does the same install + wiring in one pass - read it before you
            run it:
          </p>
          <CopyField
            value={INSPECT_INSTALL}
            label="Read the script first"
            notes="Pipe to less to read it before you run it. uninstall.sh restores the original config."
            trackSource="guide-install-inspect"
          />
          <CopyField value={CURL_INSTALL} label="Run it" trackSource="guide-install-curl" />
        </Disclose>
      </div>
    ),
  },

  'login-command': {
    note: 'The npm SDK login one-liner (npx @mcp-index/sdk login), single-sourced from PACKAGES.sdkTs. Mints a free api key.',
    render: () => (
      <div className="mt-5">
        <CopyField
          value={`npx ${PACKAGES.sdkTs} login`}
          label="Mint a free API key"
          notes="GitHub by default; add --provider google for Google. Installed the SDK globally? Run: mcpindex login"
          trackSource="guide-login"
        />
      </div>
    ),
  },

  'supported-hosts': {
    note: 'The hosts the one-liner detects and config-wires (GATE_WIRING_HOSTS). Chips update automatically when a host is added/removed.',
    render: () => (
      <div className="mt-5 rule-t rule-b rule-l rule-r p-4">
        <div className={KICKER}>Detected and wired</div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {GATE_WIRING_HOSTS.map((h) => (
            <span
              key={h}
              className="font-mono text-[11px] tracking-[0.03em] border border-[var(--color-rule)] px-2 py-1 text-[var(--color-cite)]"
            >
              {h}
            </span>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] leading-[1.5] text-[var(--color-mute)]">
          The installer rewrites each host&apos;s config so its servers launch behind the gate. It
          only touches hosts it finds; the rest are untouched.
        </p>
      </div>
    ),
  },

  'host-picker': {
    note: 'Pick-your-host install of the ADVISORY directory server (DIRECTORY_CLIENTS). One click shows only your command/config.',
    render: () => (
      <div className="mt-5">
        <GuideHostPicker hosts={DIRECTORY_CLIENTS} />
        <p className="mt-2.5 text-[12.5px] leading-[1.5] text-[var(--color-mute)]">
          This adds the advisory directory server (a normal MCP server for search and screening).
          It is not the in-path gate.
        </p>
      </div>
    ),
  },

  'drift-gate-demo': {
    note: 'The homepage interactive demo: pin a contract, apply a change, watch the gate HOLD or PROCEED. Deterministic, client-side.',
    render: () => (
      <div className="mt-5">
        <DriftGateDemo />
      </div>
    ),
  },

  'scan-tool': {
    note: 'The /scan tool: paste an mcp.json, grade blast radius in-browser (nothing uploaded).',
    render: () => (
      <div className="mt-5">
        <ScanTool />
      </div>
    ),
  },

  'ambient-trace': {
    note: 'The quiet stderr trace the gate leaves as it works. Static, honest terminal text (no safety claim).',
    render: () => (
      <div className="mt-5">
        <div className={KICKER}>On your host&apos;s stderr</div>
        <pre className="mt-2 overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3.5 font-mono text-[12px] leading-[1.6]">
          <code>
            {`mcpindex · noted github/create_issue
mcpindex · noted github/delete_repo - delete, irreversible

⬡ mcpindex - caught a silent change: a new required parameter on github/delete_repo. Held before your agent ran it.`}
          </code>
        </pre>
        <p className="mt-2.5 text-[12.5px] leading-[1.5] text-[var(--color-mute)]">
          The first time a tool runs it leaves one dim line. When a contract has drifted, a HOLD
          banner names what changed and pauses the call - a contract-diff, not a claim the tool is
          unsafe.
        </p>
      </div>
    ),
  },

  'verdict-states': {
    note: 'The vocabulary legend: gate HOLD/PROCEED (in-path contract-diff) vs directory screen REVIEW/UNVERIFIED (advisory).',
    render: () => {
      const rows: { token: string; where: string; means: string }[] = [
        { token: 'HOLD', where: 'gate, in-path', means: 'the live contract differs from what you pinned; the call is paused before your agent acts.' },
        { token: 'PROCEED', where: 'gate, in-path', means: 'no breaking difference (a benign added-optional field can pass); the call goes through.' },
        { token: 'REVIEW', where: 'directory screen', means: 'an advisory, semantic-only read flagged something to look at before you wire the tool.' },
        { token: 'UNVERIFIED', where: 'directory screen', means: 'no verdict on file yet; the directory is not asserting anything about it.' },
      ];
      return (
        <div className="mt-5 rule-t rule-b rule-l rule-r divide-y divide-[var(--color-rule)]">
          {rows.map((r) => (
            <div key={r.token} className="flex flex-col gap-1 p-3.5 sm:flex-row sm:gap-4">
              <div className="sm:w-40 shrink-0">
                <span className="font-mono text-[12px] font-medium text-[var(--color-ink)]">
                  {r.token}
                </span>
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                  {r.where}
                </span>
              </div>
              <p className="text-[13.5px] leading-[1.55] text-[var(--color-cite)]">{r.means}</p>
            </div>
          ))}
        </div>
      );
    },
  },
};

// Render an embed by key. An unknown key degrades to a small, non-fatal note
// (mirrors the loader's fail-safe ethos) so a typo in a guide never breaks the
// page or the build - it just surfaces the missing key in place.
export function renderEmbed(key: string): ReactNode {
  // "diagram:<id>" resolves against the figure registry rather than this table. Diagrams are
  // their own registry (lib/diagrams.ts) because they carry an alt, a claim and a text twin that
  // an embed key cannot; re-declaring 17 of them here would be a second place to drift.
  if (key.startsWith('diagram:')) {
    const id = key.slice('diagram:'.length);
    if (!getDiagram(id)) {
      return (
        <p className="mt-4 font-mono text-[12px] text-[var(--color-mute)]">
          [diagram: unknown id &quot;{id}&quot;]
        </p>
      );
    }
    return <Figure id={id}>{renderDiagram(id)}</Figure>;
  }
  const embed = EMBED_REGISTRY[key as EmbedKey];
  if (!embed) {
    return (
      <p className="mt-4 font-mono text-[12px] text-[var(--color-mute)]">
        [embed: unknown key &quot;{key}&quot;]
      </p>
    );
  }
  return embed.render();
}
