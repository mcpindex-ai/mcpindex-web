// Honest edges for the gate. A trust product earns trust by stating its limits.
// Cardinal rule: the gate reports a CONTRACT-DIFF, never a safety verdict — never
// say "safe" / "verified" / "blocks attacks". The full tiered ladder is live at
// launch; the behavioral tier CLEARS or REFUTES a change, it does not prove safety.

const EDGES: [string, string][] = [
  [
    'A contract-diff, not a safety verdict',
    'The gate reports that a tool’s contract changed versus what you pinned. It does not judge whether the change is malicious or whether the tool is "safe" — it tells you what changed and lets you decide.',
  ],
  [
    'Advisory in judgment, in-path so it can HOLD',
    'The verdict is advice. But the gate runs inside the call path, so a HOLD actually stops your agent before it acts on the changed contract — not a notification after the fact.',
  ],
  [
    'Deterministic diff, not an LLM guess',
    'The ChangeKind taxonomy (added-required-param, constraint-narrowed, annotation-flip-to-destructive, output-schema-changed, removed / type / enum drift) is computed structurally. Same pin, same contract, same verdict — every time.',
  ],
  [
    'Zero credential custody',
    'The gate never holds your API keys or tokens. It reads tool contracts in the session you already opened; nothing is sent to a server to make the call.',
  ],
  [
    'The full ladder, in-path and dogfooded on Cursor',
    'In-path stdio interceptor, TOFU pin with cross-restart persistence, the deterministic ChangeKind diff, Monitor / Guard / Strict postures, and the marker scan for input and output schemas run on Cursor today. Above tier-0, the cloud tier-1 corpus lookup, the tier-2 LLM consult on the ambiguous, and the tier-3 behavioral verifier escalate harder cases.',
  ],
  [
    'The behavioral tier clears or refutes — it never proves safe',
    'The tier-3 verifier exercises a changed tool to clear the change or refute it; it is not a proof of safety. Confidence is reported but not yet calibrated against a held-out corpus (calibrated=false at v1). We say "caught / held / cleared", never "guaranteed safe".',
  ],
];

export function GateEdges() {
  return (
    <div className="grid sm:grid-cols-2 rule-t rule-l">
      {EDGES.map(([k, v]) => (
        <div key={k} className="rule-b rule-r p-5 sm:p-6">
          <div className="font-mono text-[12.5px] text-[var(--color-ink)]">{k}</div>
          <p className="mt-2 text-[13.5px] leading-[1.55] text-[var(--color-cite)]">{v}</p>
        </div>
      ))}
    </div>
  );
}
