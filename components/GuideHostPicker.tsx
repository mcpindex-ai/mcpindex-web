'use client';

import { useState } from 'react';
import { CopyField } from './CopyField';
import type { DirectoryClient } from '@/lib/install/manifest';

// Pick-your-host directory-install picker: the reader clicks their MCP host and
// sees ONLY their exact command or config, instead of scanning a wall of every
// host. Reduces "which of these is mine" friction to one click.
//
// DATA COMES IN AS PROPS, typed as DirectoryClient. The `import type` is erased
// at compile time (zero runtime), so the manifest's method arrays + Buffer
// deep-link code never enter this client bundle - the server registry
// (lib/guide-embeds) passes the plain DIRECTORY_CLIENTS array in. Single source
// stays server-side, and there is one shape of truth (no parallel HostOption).
//
// A11y: a group of toggle buttons (aria-pressed), NOT a tablist. A tablist would
// promise arrow-key roving + a labelled tabpanel; a button group needs neither
// and matches the sibling components/install/DirectoryInstall pattern.

export function GuideHostPicker({ hosts }: { hosts: DirectoryClient[] }) {
  const [activeId, setActiveId] = useState(hosts[0]?.id ?? '');
  const active = hosts.find((h) => h.id === activeId) ?? hosts[0];
  if (!active) return null;

  return (
    <div className="mt-5 rule-t rule-b rule-l rule-r p-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
        Your host
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Pick your MCP host">
        {hosts.map((h) => {
          const on = h.id === active.id;
          return (
            <button
              key={h.id}
              type="button"
              aria-pressed={on}
              onClick={() => setActiveId(h.id)}
              className={`font-mono text-[11px] tracking-[0.04em] border px-2 py-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
                on
                  ? 'border-[var(--color-accent)] text-[var(--color-ink)] bg-[var(--color-accent-soft)]'
                  : 'border-[var(--color-rule)] text-[var(--color-mute)] hover:text-[var(--color-ink)] hover:border-[var(--color-cite)]'
              }`}
            >
              {h.label}
            </button>
          );
        })}
      </div>
      <div className="mt-3">
        <CopyField
          value={active.value}
          label={active.kind === 'config' ? `Add to ${active.path ?? 'your MCP config'}` : undefined}
          notes={
            active.kind === 'config'
              ? 'Drop this block into the file above, then restart the host.'
              : 'Paste and run, then restart the host.'
          }
          trackSource={`guide-hostpicker-${active.id}`}
        />
      </div>
    </div>
  );
}
