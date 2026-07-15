'use client';

import { useState } from 'react';
import { CopyField } from '@/components/CopyField';
import { trackGateInstallCopy } from '@/lib/track-gate-install';
import { DIRECTORY_CLIENTS } from '@/lib/install/manifest';

// The advisory directory server ships as a normal single MCP server, so it can
// be added one-click (Cursor / VS Code deep links) or via a per-host command.
// The gate is NOT here - it rewrites host config and has no single-server deep
// link, so it keeps its own curl/uv flow on the page above.
//
// The deep links are constant strings built server-side (they use Buffer for
// base64url) and passed in as props, so this client bundle stays Buffer-free.
export function DirectoryInstall({
  cursorHref,
  vscodeHref,
}: {
  cursorHref: string;
  vscodeHref: string;
}) {
  const [clientId, setClientId] = useState(DIRECTORY_CLIENTS[0].id);
  const client = DIRECTORY_CLIENTS.find((c) => c.id === clientId) ?? DIRECTORY_CLIENTS[0];

  return (
    <div>
      {/* One-click: the lowest-friction path for the two hosts that support it. */}
      <div className="flex flex-wrap gap-3">
        <a
          href={cursorHref}
          onClick={() => trackGateInstallCopy('install-page-oneclick-cursor')}
          className="inline-flex items-center gap-2 bg-[var(--color-ink)] text-zinc-100 px-4 py-2.5 text-[13px] font-medium hover:opacity-90"
        >
          Add to Cursor
        </a>
        <a
          href={vscodeHref}
          onClick={() => trackGateInstallCopy('install-page-oneclick-vscode')}
          className="inline-flex items-center gap-2 border border-[var(--color-rule)] px-4 py-2.5 text-[13px] font-medium text-[var(--color-ink)] hover:border-[var(--color-ink)]"
        >
          Add to VS Code
        </a>
      </div>
      <p className="mt-2 text-[12px] leading-[1.5] text-[var(--color-mute)]">
        One click adds the advisory directory server to that host. Every other host: pick it below.
      </p>

      {/* Per-client command / config. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {DIRECTORY_CLIENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setClientId(c.id)}
            aria-pressed={c.id === clientId}
            className={
              'px-3 py-1.5 text-[12px] font-mono border ' +
              (c.id === clientId
                ? 'border-[var(--color-ink)] text-[var(--color-ink)]'
                : 'border-[var(--color-rule)] text-[var(--color-mute)] hover:border-[var(--color-ink)]')
            }
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <CopyField
          value={client.value}
          label={client.kind === 'config' ? `Add to ${client.path}` : undefined}
          notes={
            client.kind === 'config'
              ? 'Merge into the mcpServers block, then restart the client.'
              : 'Paste and run, then restart the client.'
          }
          trackSource={`install-page-directory-${client.id}`}
        />
      </div>
    </div>
  );
}
