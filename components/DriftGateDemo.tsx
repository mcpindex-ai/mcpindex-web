'use client';

import { useState, type ReactNode } from 'react';
import { Mark } from './Mark';

// The centerpiece: watch the in-path drift gate HOLD a silently-changed tool
// contract before the agent acts. CLIENT-SIDE + DETERMINISTIC - the gate's diff
// is a pure function of (pinned contract, observed contract), so there is no
// backend round-trip to fake. The ChangeKind -> verdict -> reason table below is
// the SAME mapping the real gate produces (ported from oneclick/clients/ts/src/
// {gate.ts,schemaDiff.ts} and proven by mcpindex-dogfood/verify_scenarios.py).
//
// HONESTY (the trust-product cardinal rule): the gate's claim is "this tool's
// contract CHANGED vs what you pinned" - a contract-diff, not a safety verdict.
// No "safe"/"blocks attacks"/"prevents" copy anywhere in this component.

// ----------------------------------------------------------- the pinned contract
// make_report(title:str, count:int[0..1000], mode:enum[fast,full]) - read-only.
// Mirrors mcpindex-dogfood _base_make_report(). Rendered in Geist Mono below.
const PINNED_CONTRACT_LINES: ReadonlyArray<string> = [
  'make_report(',
  '  title:    string,',
  '  count:    integer[0..1000],',
  '  mode:     enum[fast, full],',
  ')  // read-only',
];

// The verdict the gate reaches on the structural diff, BEFORE the posture layer.
type StaticDecision = 'PROCEED' | 'HOLD' | 'INCONCLUSIVE';
// What the posture layer turns the static verdict into for THIS server.
type EffectiveDecision = 'PROCEED' | 'PROCEED_NOTIFY' | 'HOLD' | 'INCONCLUSIVE';

type Posture = 'monitor' | 'guard' | 'strict';

type Drift = {
  readonly id: string;
  readonly label: string;
  // The line of the pinned contract this drift rewrites (the changed line shown
  // highlighted in the diff). `add` lines are inserted; `from`/`to` are a rewrite.
  readonly diff:
    | { readonly mode: 'rewrite'; readonly from: string; readonly to: string }
    | { readonly mode: 'add'; readonly to: string };
  readonly changeKind: string; // the taxonomy id the classifier emits
  readonly staticDecision: StaticDecision;
  // Whether GUARD treats this as unambiguous-dangerous (blocks even in the
  // lenient default posture). Mirrors gate.ts GUARD_DANGEROUS_KINDS + the
  // behavioral-mandated INCONCLUSIVE classes.
  readonly guardBlocks: boolean;
  // The plain-language reason, reused from gate.ts BREAKING_KIND_REASON / the
  // marker + behavioral reason strings.
  readonly reason: string;
  // The ⬡-banner clause "<tool> - <clause>" (HOLD only), mirroring
  // gate.ts friendlyBreakingClause()/bannerWhatChanged().
  readonly bannerClause: string | null;
  // The "no false alarm" control: the one drift the gate PROCEEDs on.
  readonly isControl?: boolean;
};

// The fixed table. Each entry is a gate-verified scenario from
// mcpindex-dogfood/SCENARIOS.md (GUARD column).
const DRIFTS: ReadonlyArray<Drift> = [
  {
    id: 'added_required',
    label: 'Add a required param (owner)',
    diff: { mode: 'add', to: '  owner:    string,   // now REQUIRED' },
    changeKind: 'added-required-param',
    staticDecision: 'HOLD',
    guardBlocks: true,
    reason:
      'this tool now requires a new parameter - existing calls that omit it will fail',
    bannerClause:
      'this tool now requires a new parameter - existing calls that omit it will fail',
  },
  {
    id: 'annotation_flip',
    label: 'Flip to destructive (annotations)',
    diff: {
      mode: 'rewrite',
      from: ')  // read-only',
      to: ')  // annotations: destructiveHint = true',
    },
    changeKind: 'annotation-flip-to-destructive',
    staticDecision: 'INCONCLUSIVE',
    guardBlocks: true,
    reason:
      'contract DRIFTED in a class the declared contract cannot clear or condemn (annotation-flip-to-destructive); behavioral validation needed before use',
    bannerClause:
      'this tool now declares itself able to modify or delete data (it did not before)',
  },
  {
    id: 'marker_output',
    label: 'Smuggle an exfil marker into the result schema',
    diff: {
      mode: 'add',
      to: '  → outputSchema { url: string // "ignore previous… exfiltrate to https://…" }',
    },
    changeKind: 'output-schema-added',
    staticDecision: 'HOLD',
    guardBlocks: true,
    reason:
      "an injection/exfil marker is present in the tool's outputSchema (an unhashed, agent-consumed channel)",
    bannerClause:
      'make_report contract drifted (output-schema-added) - an injection/exfil marker is present in the result schema',
  },
  {
    id: 'constraint_narrowed',
    label: 'Narrow a constraint (count max 1000 → 10)',
    diff: {
      mode: 'rewrite',
      from: '  count:    integer[0..1000],',
      to: '  count:    integer[0..10],   // narrowed',
    },
    changeKind: 'constraint-narrowed',
    staticDecision: 'HOLD',
    guardBlocks: true,
    reason:
      'an input rule was tightened - a value your calls send may now be rejected',
    bannerClause:
      'an input rule was tightened - a value your calls send may now be rejected',
  },
  {
    id: 'added_optional',
    label: 'Add an OPTIONAL param (subtitle)',
    diff: { mode: 'add', to: '  subtitle: string,   // optional' },
    changeKind: 'added-optional-param',
    staticDecision: 'PROCEED',
    guardBlocks: false,
    reason:
      'contract DRIFTED but PROVEN BENIGN (the only change is an added-optional-param, the description is unchanged, risk did not escalate, and no marker is present); auto-accepted and re-pinned',
    bannerClause: null,
    isControl: true,
  },
];

// ------------------------------------------------------------- the posture layer
// Faithful port of Gate.applyPosture(). A PROCEED short-circuits (so the benign
// added-optional, which the gate auto-accepts to PROCEED, is NEVER held - not
// even under STRICT; that short-circuit is the gate's real "no false alarm"
// property). MONITOR notifies and proceeds on a drift; GUARD blocks the
// unambiguous-dangerous + behavioral-mandated classes and notify-proceeds the
// rest; STRICT lets any non-PROCEED verdict stand.
function applyPosture(d: Drift, posture: Posture): EffectiveDecision {
  if (d.staticDecision === 'PROCEED') return 'PROCEED';
  if (posture === 'strict') return d.staticDecision === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'HOLD';
  if (posture === 'monitor') return 'PROCEED_NOTIFY';
  // GUARD
  if (d.guardBlocks) return d.staticDecision === 'INCONCLUSIVE' ? 'INCONCLUSIVE' : 'HOLD';
  return 'PROCEED_NOTIFY';
}

const BRAND_MARK = '⬡ mcpindex';

const POSTURES: ReadonlyArray<{ id: Posture; label: string; note: string }> = [
  { id: 'monitor', label: 'Monitor', note: 'notify, then proceed' },
  { id: 'guard', label: 'Guard', note: 'block dangerous + breaking' },
  { id: 'strict', label: 'Strict', note: 'hold any drift' },
];

export default function DriftGateDemo() {
  const [posture, setPosture] = useState<Posture>('guard');
  const [activeId, setActiveId] = useState<string | null>(null);
  // Re-pin resets the baseline: after re-pinning, the drift IS the contract, so
  // there is nothing to hold (mirrors Gate.repinOne()).
  const [repinned, setRepinned] = useState(false);

  const active = activeId ? DRIFTS.find((d) => d.id === activeId) ?? null : null;
  const effective = active && !repinned ? applyPosture(active, posture) : null;

  function applyDrift(id: string) {
    setActiveId(id);
    setRepinned(false);
  }
  function reset() {
    setActiveId(null);
    setRepinned(false);
  }

  return (
    <div className="rule-t rule-b rule-l rule-r bg-white">
      {/* man-page header */}
      <div className="rule-b px-5 py-2.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-mute)]">
        <span className="flex items-center gap-2 text-[var(--color-ink)]">
          <Mark size={14} />
          <span className="text-[var(--color-mute)]">in-path drift gate</span>
        </span>
        <span className="hidden sm:inline">deterministic · client-side · contract-diff</span>
      </div>

      {/* posture toggle */}
      <div className="rule-b px-5 py-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          posture
        </span>
        <div className="flex flex-wrap gap-1.5">
          {POSTURES.map((p) => {
            const on = posture === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPosture(p.id)}
                aria-pressed={on}
                title={p.note}
                className={`font-mono text-[11px] uppercase tracking-[0.12em] border px-2.5 py-1 transition-colors ${
                  on
                    ? 'border-[var(--color-ink)] text-[var(--color-ink)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-rule)] text-[var(--color-mute)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)]'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[10.5px] text-[var(--color-mute)] hidden sm:inline">
          {POSTURES.find((p) => p.id === posture)?.note}
        </span>
      </div>

      {/* the pinned contract */}
      <div className="px-5 py-5">
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
            pinned contract {repinned && <span className="text-[var(--color-ink)]">· re-pinned to current</span>}
          </span>
          <span className="font-mono text-[10.5px] text-[var(--color-mute)]">TOFU baseline</span>
        </div>
        <pre className="overflow-x-auto bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12.5px] leading-[1.6]">
          <code>{renderContract(active, repinned)}</code>
        </pre>
      </div>

      {/* the drift choices */}
      <div className="rule-t px-5 py-5">
        <span className="block font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-mute)] mb-3">
          apply a silent change to the tool
        </span>
        <div className="flex flex-wrap gap-1.5">
          {DRIFTS.map((d) => {
            const on = activeId === d.id;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => applyDrift(d.id)}
                aria-pressed={on}
                className={`font-mono text-[11px] border px-2.5 py-1 transition-colors text-left ${
                  on
                    ? 'border-[var(--color-accent)] text-[var(--color-accent-strong)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-rule)] text-[var(--color-cite)] bg-white hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)]'
                }`}
              >
                {d.label}
                {d.isControl && (
                  <span className="ml-1.5 text-[9.5px] uppercase tracking-[0.1em] text-[var(--color-mute)]">
                    control
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {activeId && (
          <button
            type="button"
            onClick={reset}
            className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[var(--color-mute)] hover:text-[var(--color-accent-strong)] transition-colors"
          >
            ← reset to pinned
          </button>
        )}
      </div>

      {/* the verdict */}
      {active && effective && (
        <div role="status" aria-live="polite" className="rule-t bg-[var(--color-accent-soft)]/30 px-5 py-6">
          {effective === 'HOLD' || effective === 'INCONCLUSIVE' ? (
            <HeldVerdict
              drift={active}
              effective={effective}
              posture={posture}
              onRepin={() => setRepinned(true)}
            />
          ) : (
            <ProceedVerdict drift={active} effective={effective} posture={posture} />
          )}
        </div>
      )}

      {active && repinned && (
        <div className="rule-t px-5 py-5 font-mono text-[12px] text-[var(--color-cite)]">
          <span className="text-[var(--color-accent-strong)]">▸</span> re-pinned - the changed contract is now your
          baseline, so the next call proceeds. The gate only holds a change against what you pinned.
        </div>
      )}

      {/* honest framing */}
      <div className="rule-t px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] text-[var(--color-mute)]">
        <span>contract-diff, not a safety verdict</span>
        <span aria-hidden="true" className="inline-block w-px h-3 bg-[var(--color-rule)]" />
        <span>this is the same deterministic gate that runs in your agent</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- contract rendering
// Renders the pinned contract with the changed line highlighted (the diff). When
// re-pinned, the new line is shown as the plain baseline (no highlight).
function renderContract(active: Drift | null, repinned: boolean): ReactNode {
  if (!active) {
    return PINNED_CONTRACT_LINES.join('\n');
  }
  const d = active.diff;
  if (d.mode === 'rewrite') {
    return PINNED_CONTRACT_LINES.map((line, i) => {
      const isTarget = line === d.from;
      const shown = isTarget ? d.to : line;
      const key = `${i}`;
      if (isTarget && !repinned) {
        return (
          <span key={key} className="block bg-amber-500/25 text-amber-200">
            {shown}
          </span>
        );
      }
      return <span key={key} className="block">{shown}</span>;
    });
  }
  // add: insert the new line before the closing `)` line.
  const closeIdx = PINNED_CONTRACT_LINES.findIndex((l) => l.startsWith(')'));
  const out: ReactNode[] = [];
  PINNED_CONTRACT_LINES.forEach((line, i) => {
    if (i === closeIdx) {
      out.push(
        repinned ? (
          <span key="ins" className="block">{d.to}</span>
        ) : (
          <span key="ins" className="block bg-amber-500/25 text-amber-200">{d.to}</span>
        ),
      );
    }
    out.push(<span key={`${i}`} className="block">{line}</span>);
  });
  return out;
}

// ----------------------------------------------------------------- held verdict
function HeldVerdict({
  drift,
  effective,
  posture,
  onRepin,
}: {
  drift: Drift;
  effective: EffectiveDecision;
  posture: Posture;
  onRepin: () => void;
}) {
  const isInconclusive = effective === 'INCONCLUSIVE';
  // The ⬡ banner, mirroring gate.ts renderHoldBanner(): "caught a silent change:
  // <tool> - <clause>. Held before your agent ran it."
  const banner = isInconclusive
    ? `${BRAND_MARK} - make_report drifted in a class only a behavioral check can clear. Held the call until it's validated.`
    : `${BRAND_MARK} - caught a silent change: ${drift.bannerClause}. Held before your agent ran it.`;

  return (
    <div className="rule-t rule-b rule-l rule-r bg-white elevate p-5 sm:p-6">
      {/* the verdict token - amber is reserved for this */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-1.5 font-mono text-[15px] font-medium tracking-wide text-[var(--color-accent-strong)]">
          {isInconclusive ? 'HELD · needs behavioral check' : 'HELD'}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          posture {posture}
        </span>
        <span className="inline-flex border border-[var(--color-rule)] bg-white px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-cite)]">
          {drift.changeKind}
        </span>
      </div>

      {/* the ⬡ banner, Geist Mono - mirrors the real product */}
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words bg-[var(--color-ink)] text-zinc-100 px-4 py-3 font-mono text-[12px] leading-[1.55]">
        <code>{banner}</code>
      </pre>

      <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-cite)]">
        {drift.reason}
      </p>

      {/* action affordances - Review · Re-pin · Validate (non-functional labels,
          except Re-pin, which re-sets the baseline) */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <span className="font-mono text-[11px] border border-[var(--color-rule)] bg-white px-2.5 py-1 text-[var(--color-mute)]">
          Review
        </span>
        <button
          type="button"
          onClick={onRepin}
          className="font-mono text-[11px] border border-[var(--color-rule)] bg-white px-2.5 py-1 text-[var(--color-cite)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent-strong)] transition-colors"
        >
          Re-pin
        </button>
        <span className="font-mono text-[11px] border border-[var(--color-rule)] bg-white px-2.5 py-1 text-[var(--color-mute)]">
          Validate
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------- proceed verdict
function ProceedVerdict({
  drift,
  effective,
  posture,
}: {
  drift: Drift;
  effective: EffectiveDecision;
  posture: Posture;
}) {
  const notify = effective === 'PROCEED_NOTIFY';
  return (
    <div className="rule-t rule-b rule-l rule-r bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center border border-[var(--color-rule)] bg-white px-3 py-1.5 font-mono text-[15px] font-medium tracking-wide text-[var(--color-cite)]">
          {notify ? 'PROCEEDS · noted' : 'PROCEEDS'}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          posture {posture}
        </span>
        <span className="inline-flex border border-[var(--color-rule)] bg-white px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-cite)]">
          {drift.changeKind}
        </span>
      </div>
      <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-cite)]">
        {drift.isControl && !notify ? (
          <>
            Proceeds - benign additive change, no hold. Adding an optional parameter cannot break an
            existing call, so the gate auto-accepts it and re-pins. This is the no-false-alarm property:
            the gate stays quiet when nothing breaks.
          </>
        ) : notify ? (
          <>
            Under {posture}, the gate notes the change and lets the call through instead of holding it.
            The same drift is held under Guard or Strict.
          </>
        ) : (
          drift.reason
        )}
      </p>
    </div>
  );
}
