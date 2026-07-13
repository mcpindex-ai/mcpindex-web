import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { CATEGORY_LABELS } from '@/lib/categorize';
import { D3_REQUIRED_LABELS, D3_PROGRESS } from '@/lib/honest-limits';
import type { IndexedServer } from '@/lib/types';

export const revalidate = 3600;

// Process-lifetime body cache keyed by snapshot_version. Snapshot turns over
// daily via cron, so serializing once per version is sufficient.
let bodyCache: { version: string; body: string } | null = null;

function buildBody(servers: IndexedServer[]): string {
  const byCategory = new Map<string, IndexedServer[]>();
  for (const s of servers) {
    const bucket = byCategory.get(s.category);
    if (bucket) bucket.push(s);
    else byCategory.set(s.category, [s]);
  }
  const parts: string[] = [
    '# mcpindex.ai - Full Index',
    '',
    `Total servers: ${servers.length}. Categories: ${byCategory.size}.`,
    'Format: one server per block, grouped by category.',
    '',
    '## Drift Gate (in-path; tier-0 live, tiers 1-3 held off by default)',
    '',
    'In-path trust gate for agent tool calls. Pins each MCP tool contract trust-on-first-use (TOFU) and HOLDs a call before the agent acts the moment the contract silently changes. Sits in the call path, so it can HOLD (not merely alert like the advisory screen).',
    'Method: deterministic contract-diff over a ChangeKind taxonomy (added-required-param, required-set-expanded, constraint-narrowed, type-changed, enum-values-removed, removed-param, annotation-flip-to-destructive, output-schema-added/changed, tool-added/removed) + an injection/exfil marker scan over input schema, output schema, and description. Postures: Monitor / Guard (default) / Strict. Fail-closed.',
    'Install: one-click config-wire across Claude Desktop / Claude Code / Cursor / Gemini CLI / Cline / Zed via uv tool install mcpindex-gate (or curl https://mcpindex.ai/install.sh | sh). Legacy mcpindex-preflight is EOL (frozen 0.7.0); install mcpindex-gate. Zero credentials change hands. Or the SDK wrap() one-liner (TS + Python). See https://mcpindex.ai/docs.',
    'Tiered ladder: tier-0 deterministic contract-diff is the live, deterministic leg and runs first. Above it the ladder is built as in-path seams — a cloud tier-1 corpus lookup, a tier-2 LLM consult on the ambiguous, and a tier-3 behavioral verifier that exercises a changed tool to clear or refute the change — but each is held off by default and requires explicit opt-in; the default build egresses nothing and stays fail-closed.',
    'Honest limits: contract_diff_not_safety_verdict (a HOLD means the contract CHANGED vs your pin, not that it is unsafe; when enabled, the behavioral tier clears or refutes, it does not prove a tool safe); tiers1to3_held_off_by_default_opt_in; default_build_egresses_nothing_fail_closed; calibrated_false_v1 (confidence reported but not yet calibrated against a held-out corpus).',
    'Status: tier-0 deterministic contract-diff is live and verified end-to-end against the live gate; tiers 1-3 are built but held off by default (opt-in).',
    '',
    '## Blast-Radius Grade (in-path; advisory, on by default)',
    '',
    'Alongside the contract-diff, the gate labels the blast radius of every tool call before the agent acts — what it would do (read, write, delete, send), whether it can be undone, and whether it leaves the machine. A read and an irreversible delete look identical to an agent until something labels them; this is that label.',
    'Method: a deterministic static classifier derived from the tool\'s own declared contract (name, description, input/output schema). It reads what a call WOULD do; it does not run the tool. Output is a typed action_type, side_effect_class, reversibility, and egress, plus a static autonomy ceiling. Deny-by-construction: every field is a typed enum/hash/bool, so no raw argument value can ride along in the grade.',
    'Posture: advisory and fail-closed — when the contract is ambiguous it grades toward the more dangerous class (assumes a write/irreversible), never down.',
    'Where it runs: on by default in the published clients — @mcp-index/sdk (TypeScript) and mcpindex-gate (Python). Deterministic, no network, no credentials.',
    'Honest limits: blast_radius_is_static_not_a_safety_verdict (it says what a call would do, read from the contract — not whether the contract is safe, and not what a specific call\'s runtime arguments will actually do); advisory_grade_orchestrator_decides (mcpindex labels the blast radius; your agent or IDE owns whether to allow, pause, or require approval).',
    '',
    '## Advisory directory screen (v1)',
    '',
    'Each server page exposes a verdict surface. Contract states: ALLOW / DENY / REVIEW / UNVERIFIED. At v1 every published verdict is REVIEW or UNVERIFIED — ALLOW and DENY are reserved, not produced.',
    'Verdict contract version: 1.0.0. Capability: check_tool_trust (via the npm MCP server — directory client, not the in-path gate).',
    'Pipeline (screen): today the screen is semantic-only — an LLM judge reads each tool description for hidden instructions. The deterministic conformance probe (drives the tool against its declared schema) is built but has NOT yet run on the public corpus, so no published screen verdict carries a conformance result; a clearing ALLOW (which the probe would earn) is not produced at v1. When the probe runs it is monitored, not enforced. Confidence is reported but not yet calibrated (calibrated=false).',
    'History: OTS Bitcoin-anchored. Cadence bound = confirmation latency (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized). Sub-window precision asserted, not proven. In-process verify proves the proof carries a Bitcoin BlockHeaderAttestation; confirmation-depth check requires the relying party run their own Bitcoin node.',
    `Calibration: calibrated=false at v1. D3 graduation gate: >=${D3_REQUIRED_LABELS} conforming labels with FP upper-95 <=2%. Current: ${D3_PROGRESS}. Terminal-v1 trigger 2026-09-01: under 50 conforming = ships calibrated=false as terminal v1 (v2 graduation, not v1).`,
    'Posture: advisory. The agent or IDE decides whether to act on the verdict.',
    'Endpoints:',
    '  - GET /api/v1/trust/tool/{server_id}/{tool_name}  per-tool advisory screen (v1: REVIEW when screened, else UNVERIFIED fail-closed; ALLOW/DENY reserved).',
    '  - GET /api/v1/trust/server/{server_id}            server-level advisory screen (same honesty).',
    'Full method: https://mcpindex.ai/methodology',
    '',
    '## Whitepaper',
    '',
    'Full architecture of the in-path trust gate (and the trust-to-act category it belongs to): threat model, the tiered ladder, methodology, the dogfood proof (§7), and the honest limits (contract-diff not safety oracle; calibrated=false; tiers 1-3 held off by default). Public and free to read in full, with a free PDF and no email wall.',
    'Read: https://mcpindex.ai/whitepaper',
    'PDF: https://mcpindex.ai/whitepaper.pdf',
    '',
  ];
  for (const [cat, list] of [...byCategory.entries()].sort()) {
    parts.push(`\n## ${CATEGORY_LABELS[cat] ?? cat} (${list.length})\n`);
    for (const s of list) {
      const installs: string[] = [];
      if (s.npmPackage) installs.push(`npm:${s.npmPackage}`);
      if (s.pypiPackage) installs.push(`pypi:${s.pypiPackage}`);
      if (s.dockerImage) installs.push(`docker:${s.dockerImage}`);
      if (s.remoteUrl) installs.push(`remote:${s.remoteUrl}`);
      parts.push(
        `- ${s.title} (${s.name}@${s.version})`,
        `  ${s.description}`,
        `  installs: ${installs.join(' | ') || 'manual'}`,
        `  detail: https://mcpindex.ai/server/${s.slug}`,
        '',
      );
    }
  }
  return parts.join('\n');
}

export async function GET() {
  const meta = await loadSnapshotMeta();
  if (!bodyCache || bodyCache.version !== meta.version) {
    const servers = await loadServers();
    bodyCache = { version: meta.version, body: buildBody(servers) };
  }
  return new Response(bodyCache.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-Snapshot-Version': meta.version,
    },
  });
}
