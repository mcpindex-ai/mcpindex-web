// The gate loop, stated as four concrete steps. Server component, no state —
// it is reference prose, not an interactive surface. The honest claim is fixed:
// the gate reports a CONTRACT-DIFF ("this changed vs what you pinned"), not a
// safety verdict.

const STEPS: { n: string; title: string; body: string; note?: string }[] = [
  {
    n: '01',
    title: 'Install once, rides your agent',
    body: 'One config-wire in Claude Desktop, Cursor, Cline, or Zed. The gate sits in the MCP session your agent already opens. No credentials and no proxy account; the deterministic contract-diff runs locally and the default build egresses nothing (the optional cloud tier-1 lookup, held off by default, sends only a contract hash, never tokens or call data).',
    note: 'stdio interceptor + TS / Python SDK',
  },
  {
    n: '02',
    title: 'Pins each tool on first sight',
    body: 'The first time a tool is offered, the gate records its contract (name, params, constraints, annotations, input and output schema) and persists it across restarts. Trust-on-first-use (TOFU): the baseline is what you actually saw, not a registry claim.',
    note: 'TOFU pin · cross-restart persistence',
  },
  {
    n: '03',
    title: 'HOLDs the call when the contract changes',
    body: 'On every later call the gate diffs the live contract against your pin. If a tool silently added a required param, narrowed a constraint, flipped an annotation to destructive, or grew a new output field, the gate HOLDs the call before your agent acts and names exactly what changed: the ChangeKind, in plain words.',
    note: 'deterministic diff · Monitor / Guard / Strict',
  },
  {
    n: '04',
    title: 'You review, re-pin, or validate',
    body: 'A held call is a decision, not a dead end: read the diff, accept the change and re-pin the new contract, or send it back. A benign added-optional param proceeds silently, no false alarm. The verdict is "this changed", never "this is unsafe".',
    note: 'review · re-pin · validate',
  },
];

export function GateLoop() {
  return (
    <div className="rule-t">
      {STEPS.map((s) => (
        <div
          key={s.n}
          className="rule-b grid grid-cols-[48px_1fr] sm:grid-cols-[72px_1fr_minmax(180px,220px)] gap-5 sm:gap-10 py-9 px-2 group hover:bg-[var(--color-accent-soft)]/30 transition-colors"
        >
          <div className="font-mono text-[12px] text-[var(--color-accent)] tabular-nums pt-1">
            {s.n}
          </div>
          <div>
            <h3 className="t-h4 font-medium text-[var(--color-ink)]">{s.title}</h3>
            <p className="mt-2 text-[14.5px] leading-[1.55] text-[var(--color-cite)]">
              {s.body}
            </p>
          </div>
          {s.note && (
            <div className="col-span-2 sm:col-span-1 sm:text-right">
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-mute)] leading-[1.6]">
                {s.note}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
