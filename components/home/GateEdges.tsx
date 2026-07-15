// Honest edges for the gate. A trust product earns trust by stating its limits.
// Cardinal rule: the gate reports a CONTRACT-DIFF, never a safety verdict - never
// say "safe" / "verified" / "blocks attacks". Tier-0 (the deterministic contract-
// diff) is the live, deterministic leg; tiers 1-3 are built in-path seams,
// HELD off by default (each requires explicit opt-in). The behavioral tier CLEARS
// or REFUTES a change, it does not prove safety.

const EDGES: [string, string][] = [
  [
    'A contract-diff, not a safety verdict',
    'The gate reports that a tool’s contract changed versus what you pinned. It does not judge whether the change is malicious or whether the tool is "safe". It tells you what changed and lets you decide.',
  ],
  [
    'Advisory in judgment, in-path so it can HOLD',
    'The verdict is advice. But the gate runs inside the call path, so a HOLD actually stops your agent before it acts on the changed contract. It is not a notification after the fact.',
  ],
  [
    'Fails closed, never open',
    'When the gate can’t verify a changed contract (an unparsed tool, a tier held off, a degraded check), it HOLDs the call rather than waving it through. Doubt resolves to REVIEW or a hold, never to a silent proceed.',
  ],
  [
    'Deterministic diff, not an LLM guess',
    'The ChangeKind taxonomy (added-required-param, constraint-narrowed, annotation-flip-to-destructive, output-schema-changed, removed / type / enum drift) is computed structurally. Same pin, same contract, same verdict, every time.',
  ],
  [
    'Zero credential custody',
    'The gate never holds your API keys or tokens. It reads tool contracts in the session you already opened; nothing is sent to a server to make the call.',
  ],
  [
    'Tier-0 is live; tiers 1-3 are built but held off by default',
    'What runs on Cursor today: the in-path stdio interceptor, the TOFU pin with cross-restart persistence, the deterministic ChangeKind diff, Monitor / Guard / Strict postures, and the marker scan for input and output schemas. Above tier-0 the ladder is built as in-path seams (a cloud tier-1 corpus lookup, a tier-2 LLM consult, a tier-3 behavioral verifier), but each is held off by default and requires explicit opt-in. The default build egresses nothing and stays fail-closed.',
  ],
  [
    'The behavioral tier clears or refutes - it never proves safe',
    'When enabled, the tier-3 verifier exercises a changed tool to clear the change or refute it; it is not a proof of safety, and it is unavailable by default. Confidence is reported but not yet calibrated against a held-out corpus (calibrated=false at v1). We say "caught / held / cleared", never "guaranteed safe".',
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
