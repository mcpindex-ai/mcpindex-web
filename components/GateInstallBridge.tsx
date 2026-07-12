import Link from 'next/link';
import { CopyField } from '@/components/CopyField';
import { INSTALL_SHELL_COMMAND } from '@/lib/install-command';
import { Mark } from '@/components/Mark';

/**
 * Converts directory landings (/server/*) into gate installs.
 * Distinct from the rail "Install" block, which installs THIS server only.
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
        Zero credentials. This is not the package install for this server itself
        (use <strong>Install this server</strong> for that).
      </p>
      <div className="mt-4">
        <CopyField
          label="Install the mcpindex gate (one command)"
          value={INSTALL_SHELL_COMMAND}
          trackSource="server_bridge"
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
