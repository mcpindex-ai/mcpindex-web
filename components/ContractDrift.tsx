'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { kindLabel } from '@/lib/kindLabels';
import { fmtUtc, fmtDay } from '@/lib/dates';

// Server-level contract-drift section, fetched at RUNTIME from /api/v1/server-drift (the build can't
// reach Upstash; this is always current). Server-level only - individual tools stay anonymized.
// Renders nothing while loading or when drift is unavailable (flag off / ledger down) - never a
// false "clean". Neutral contract-diff framing, mirrors /ledger.

interface ServerDrift {
  changes: number;
  lastSeen: string | null;
  kinds: string[];
  safetyRelevant: boolean;
  ledgerGeneratedAt: string;
  toolsetReplaced?: boolean;
  versionSameCount?: number;
  versionChangedCount?: number;
  versionUndeclaredCount?: number;
}

export function ContractDrift({ serverId }: { serverId: string }) {
  const [drift, setDrift] = useState<ServerDrift | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/v1/server-drift?server=${encodeURIComponent(serverId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ServerDrift) => {
        if (alive) {
          setDrift(d);
          setShow(true);
        }
      })
      .catch(() => {
        /* flag off / ledger down / error -> render nothing, never a false clean */
      });
    return () => {
      alive = false;
    };
  }, [serverId]);

  if (!show || !drift) return null;
  const generated = fmtDay(drift.ledgerGeneratedAt);
  const lastSeen = fmtUtc(drift.lastSeen);

  return (
    <section className="mt-14">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-mute)] mb-4">
        Contract drift&nbsp;·&nbsp;crawler-observed&nbsp;·&nbsp;
        <Link href="/ledger" className="hover:text-[var(--color-accent-strong)]">
          ledger
        </Link>
      </div>
      <div className="rule-t rule-b rule-l rule-r p-5 bg-white">
        {drift.changes === 0 ? (
          <p className="text-[14px] leading-[1.6] text-[var(--color-cite)]">
            No contract changes observed for this server in the current crawl window
            {generated ? ` (as of ${generated})` : ''}. This reflects the public-registry crawl only,
            not a guarantee of stability.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-[14px] uppercase tracking-[0.18em] px-2.5 py-1 bg-[var(--color-accent-soft)] text-[var(--color-cite)] border border-[var(--color-rule)] tabular-nums">
                {drift.changes.toLocaleString()} contract change{drift.changes === 1 ? '' : 's'} observed
              </span>
              {lastSeen && (
                <span className="font-mono text-[11px] text-[var(--color-mute)]">most recent {lastSeen}</span>
              )}
              {drift.safetyRelevant && (
                <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] px-2 py-0.5 border border-[var(--color-cite)] text-[var(--color-cite)]">
                  safety-relevant diff
                </span>
              )}
            </div>
            {(() => {
              const same = drift.versionSameCount ?? 0;
              const changed = drift.versionChangedCount ?? 0;
              const undeclared = drift.versionUndeclaredCount ?? 0;
              if (same + changed + undeclared === 0) return null;
              if (undeclared > 0 && same === 0 && changed === 0) {
                return (
                  <p className="mt-3 text-[13px] leading-[1.55] text-[var(--color-cite)]">
                    This server did not declare a version when these changes were observed, so
                    they cannot be classified as silent or version-changed.
                  </p>
                );
              }
              return (
                <p className="mt-3 text-[13px] leading-[1.55] text-[var(--color-cite)]">
                  {same > 0 && `${same} change${same === 1 ? '' : 's'} with the declared version unchanged`}
                  {same > 0 && changed > 0 && ' · '}
                  {changed > 0 && `${changed} change${changed === 1 ? '' : 's'} with a version change`}
                  {undeclared > 0 &&
                    ` · ${undeclared} observed while no version was declared`}
                  .
                </p>
              );
            })()}
            {drift.kinds.length > 0 && (
              <div className="mt-3 flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
                  what changed
                </span>
                {drift.kinds.map((k) => (
                  <span
                    key={k}
                    title={k}
                    className="text-[11px] px-2 py-0.5 border border-[var(--color-rule)] text-[var(--color-cite)]"
                  >
                    {k === 'tool-removed' && drift.toolsetReplaced
                      ? `${kindLabel(k)} (toolset replaced)`
                      : kindLabel(k)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        <p className="mt-4 font-mono text-[10.5px] leading-[1.55] text-[var(--color-mute)]">
          Observed by mcpindex&rsquo;s crawler between daily registry snapshots - a contract diff, not
          a safety verdict, and not an in-path prevention (that is the gate). A &ldquo;safety-relevant
          diff&rdquo; touches a safety-relevant field; it is not a confirmed vulnerability. Shown at
          the server level; individual tools stay anonymized. Absence is not a clean bill of health:
          only public-registry servers are crawled.
        </p>
      </div>
    </section>
  );
}
