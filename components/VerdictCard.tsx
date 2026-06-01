import type {
  Verdict,
  Decision,
  DimensionVerdict,
  Severity,
} from '@/lib/verdicts';

// The keystone: one component renders a verdict consistently everywhere.
// Color is reserved almost entirely for this card (the site is otherwise
// zinc/orange/mono). ALLOW green is intentionally rare = meaningful; the
// default posture is fail-closed (no verdict -> not-yet-screened, never green).

const DECISION: Record<
  Decision,
  { cls: string; label: string }
> = {
  ALLOW: { cls: 'text-emerald-700 bg-emerald-50 border-emerald-300', label: 'ALLOW' },
  DENY: { cls: 'text-red-700 bg-red-50 border-red-300', label: 'DENY' },
  REVIEW: { cls: 'text-amber-700 bg-amber-50 border-amber-300', label: 'REVIEW' },
};

const DIM: Record<DimensionVerdict, string> = {
  PASS: 'text-emerald-700 border-emerald-300',
  FAIL: 'text-red-700 border-red-300',
  UNVERIFIED: 'text-stone-500 border-stone-300',
  ERROR: 'text-amber-700 border-amber-300',
};

// Friendly labels for the v1 dimension ids.
const DIM_LABEL: Record<string, string> = {
  'mcpindex.integrity.description': 'description integrity',
  'mcpindex.conformance.schema': 'schema conformance',
};

function freshness(expires_at: string): string | null {
  if (!expires_at) return null;
  const t = Date.parse(expires_at);
  if (Number.isNaN(t)) return null;
  return `verdict expires ${expires_at.slice(0, 10)}`;
}

const LIMIT_LABEL: Record<string, string> = {
  conformance_monitored_not_enforced: 'conformance monitored, not enforced',
  calibrated_false_v1: 'not yet calibrated',
  advisory_deployment: 'advisory',
  // Limit keys emitted by the seeded description-level verdicts.
  semantic_only_no_conformance: 'semantic screen only, no live conformance',
  description_level_screen: 'description-level screen',
  registry_description_only_no_input_schema: 'registry description only, no input schema',
  advisory: 'advisory',
  no_verdict_data_in_v1_advisory: 'no verdict on file yet',
};

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  const d = DECISION[verdict.directive.decision];
  const exp = freshness(verdict.directive.expires_at);

  return (
    <div className="rule-t rule-b rule-l rule-r bg-white elevate p-5 sm:p-6">
      {/* decision token + status */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center border px-3 py-1.5 font-mono text-[15px] font-medium tracking-wide ${d.cls}`}
        >
          {d.label}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-mute)]">
          status {verdict.status}
        </span>
        {exp && (
          <span className="font-mono text-[11px] text-[var(--color-mute)]">· {exp}</span>
        )}
      </div>

      {verdict.directive.rationale && (
        <p className="mt-4 text-[14px] leading-[1.55] text-[var(--color-cite)] max-w-[640px]">
          {verdict.directive.rationale}
        </p>
      )}

      {/* dimensions */}
      {verdict.dimensions.length > 0 && (
        <div className="mt-5 rule-t">
          {verdict.dimensions.map((dim) => (
            <div
              key={dim.id}
              className="rule-b grid grid-cols-[1fr_auto_auto] gap-3 py-2.5 items-center"
            >
              <span className="font-mono text-[12.5px] text-[var(--color-cite)]">
                {DIM_LABEL[dim.id] ?? dim.id}
              </span>
              <span
                className={`justify-self-end inline-flex border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] ${DIM[dim.verdict]}`}
              >
                {dim.verdict}
              </span>
              <span className="justify-self-end font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-mute)] w-[72px] text-right">
                {dim.verdict === 'PASS' ? '' : dim.severity}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* honest limits */}
      {verdict.honest_limits && verdict.honest_limits.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {verdict.honest_limits.map((l) => (
            <span
              key={l}
              className="font-mono text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1"
            >
              {LIMIT_LABEL[l] ?? l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
