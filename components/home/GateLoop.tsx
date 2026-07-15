// The gate loop, stated as four concrete steps. Server component, no state -
// it is reference prose, not an interactive surface. The honest claim is fixed:
// the gate reports a CONTRACT-DIFF ("this changed vs what you pinned"), not a
// safety verdict.

export const GATE_LOOP_STEPS: {
  n: string;
  title: string;
  body: string;
  detail?: string;
  note?: string;
}[] = [
  {
    n: '01',
    title: 'Install once, rides your agent',
    body: 'One config-wire in Claude Desktop, Claude Code, Cursor, Gemini CLI, Cline, or Zed. The gate sits in your agent’s MCP session. No credentials; the contract-diff runs locally and the default build egresses nothing.',
    detail:
      'The optional cloud tier-1 lookup, held off by default, sends only a contract hash-never tokens or call data.',
    note: 'stdio interceptor + TS / Python SDK',
  },
  {
    n: '02',
    title: 'Pins each tool on first sight',
    body: 'On first sight, the gate records the tool’s contract-name, params, constraints, annotations, schemas-and persists it across restarts. TOFU: the baseline is what you saw.',
    note: 'TOFU pin · cross-restart persistence',
  },
  {
    n: '03',
    title: 'HOLDs the call when the contract changes',
    body: 'On every later call, the gate diffs the live contract against your pin. Silent required-param adds, narrowed constraints, or destructive flips HOLD the call and name the ChangeKind.',
    note: 'deterministic diff · Monitor / Guard / Strict',
  },
  {
    n: '04',
    title: 'You review, re-pin, or validate',
    body: 'A held call is a decision: read the diff, re-pin the new contract, or send it back. Benign added-optional proceeds silently. The verdict is “this changed,” never “this is unsafe.”',
    note: 'review · re-pin · validate',
  },
];

/** @param compact - titles + notes always visible; body/detail behind <details>. */
export function GateLoop({ compact = false }: { compact?: boolean }) {
  return (
    <ol className="rule-t m-0 list-none p-0">
      {GATE_LOOP_STEPS.map((s) => (
        <li
          key={s.n}
          className="rule-b grid grid-cols-[48px_1fr] sm:grid-cols-[72px_1fr_minmax(180px,220px)] gap-5 sm:gap-10 py-9 px-2 group hover:bg-[var(--color-accent-soft)]/30 transition-colors"
        >
          <div className="font-mono text-[12px] text-[var(--color-accent)] tabular-nums pt-1" aria-hidden="true">
            {s.n}
          </div>
          <div>
            <h3 className="t-h4 font-medium text-[var(--color-ink)]">{s.title}</h3>
            {compact ? (
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-mute)] hover:text-[var(--color-ink)]">
                  How this step works
                </summary>
                <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">{s.body}</p>
                {s.detail && (
                  <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">{s.detail}</p>
                )}
              </details>
            ) : (
              <>
                <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">{s.body}</p>
                {s.detail && (
                  <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">{s.detail}</p>
                )}
              </>
            )}
          </div>
          {s.note && (
            <div className="col-span-2 sm:col-span-1 sm:text-right">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-mute)] leading-[1.6]">
                {s.note}
              </span>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
