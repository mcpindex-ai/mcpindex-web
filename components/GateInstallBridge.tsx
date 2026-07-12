import Link from 'next/link';
import { CopyField } from '@/components/CopyField';
import { INSTALL_SHELL_COMMAND } from '@/lib/install-command';
import { Mark } from '@/components/Mark';

/**
 * Converts directory landings (/server/*) into gate installs.
 * Distinct from the rail "Install" block, which installs THIS server.
 */
export function GateInstallBridge({ serverTitle }: { serverTitle: string }) {
  return (
    <section
      className="mt-10 rule-t rule-b rule-l rule-r border-[var(--color-accent)] bg-[var(--color-accent-soft)] p-4 sm:p-5"
      aria-labelledby="gate-install-bridge-heading"
    >
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-accent)] mb-2 flex items-center gap-2">
        <Mark size={12} />
        In-path gate · all MCP tools
      </div>
      <h2
        id="gate-install-bridge-heading"
        className="text-[16px] sm:text-[17px] font-medium tracking-tight text-[var(--color-ink)] leading-snug"
      >
        Using {serverTitle} in Claude, Cursor, Cline, or Zed?
      </h2>
      <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-cite)]">
        MCP tool contracts can change remotely with no version bump. The mcpindex gate pins
        each contract and <strong>HOLDs the call</strong> when it drifts—before your agent acts.
        Zero credentials. Separate from installing this server below.
      </p>
      <div className="mt-4">
        <CopyField
          label="Install the gate (one command)"
          value={INSTALL_SHELL_COMMAND}
          notes="Rewrites your MCP host config so each server launches behind the gate. Inspect first: curl -fsSL https://mcpindex.ai/install.sh | less"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11.5px] uppercase tracking-[0.12em]">
        <Link
          href="/docs#install-the-gate"
          className="text-[var(--color-cite)] underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
        >
          Auditable install path →
        </Link>
        <Link
          href="/#demo"
          className="text-[var(--color-mute)] hover:text-[var(--color-accent)]"
        >
          Watch it hold a drift →
        </Link>
      </div>
    </section>
  );
}

/** Compact sticky-rail cue; full command lives in GateInstallBridge. */
export function GateInstallRailCue() {
  return (
    <div>
      <div className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)] mb-3">
        Protect every tool
      </div>
      <p className="text-[12.5px] leading-[1.5] text-[var(--color-cite)]">
        Install this server above. Then put the{' '}
        <Link
          href="/#install"
          className="underline decoration-[var(--color-rule)] underline-offset-4 hover:text-[var(--color-accent)]"
        >
          mcpindex gate
        </Link>{' '}
        in front of it so a silent contract change cannot run unseen.
      </p>
      <Link
        href="/docs#install-the-gate"
        className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-accent)] hover:opacity-80"
      >
        Install the gate →
      </Link>
    </div>
  );
}
