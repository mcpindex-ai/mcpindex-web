import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { CATEGORY_LABELS } from '@/lib/categorize';
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
    '## Trust Layer (v1, advisory)',
    '',
    'Each server page exposes a verdict surface (ALLOW / DENY / REVIEW / UNVERIFIED) once the hybrid eval has run.',
    'Verdict contract version: 1.0.0. Capability: check_tool_trust (via the npm MCP server).',
    'Pipeline: an LLM judge reads each tool description for hidden instructions, and a deterministic conformance probe drives the tool against its declared schema. Conformance is monitored, not enforced; confidence is reported but not yet calibrated (calibrated=false).',
    'History: OTS Bitcoin-anchored. Cadence bound = confirmation latency (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized). Sub-window precision asserted, not proven. In-process verify proves the proof carries a Bitcoin BlockHeaderAttestation; confirmation-depth check requires the relying party run their own Bitcoin node.',
    'Calibration: calibrated=false at v1. D3 graduation gate: >=150 conforming labels with FP upper-95 <=2%. Current: 15/150. Terminal-v1 trigger 2026-09-01: under 50 conforming = ships calibrated=false as terminal v1 (v2 graduation, not v1).',
    'Posture: advisory. The agent or IDE decides whether to act on the verdict.',
    'Endpoints:',
    '  - GET /api/v1/trust/tool/{server_id}/{tool_name}  per-tool verdict (v1 advisory returns UNVERIFIED).',
    '  - GET /api/v1/trust/server/{server_id}            server-level verdict (v1 advisory returns UNVERIFIED).',
    'Full method: https://mcpindex.ai/methodology',
    '',
    '## Drift Gate (in-path, live)',
    '',
    'In-path trust gate for agent tool calls. Pins each MCP tool contract trust-on-first-use (TOFU) and HOLDs a call before the agent acts the moment the contract silently changes. Sits in the call path, so it can HOLD (not merely alert like the advisory screen).',
    'Method: deterministic contract-diff over a ChangeKind taxonomy (added-required-param, required-set-expanded, constraint-narrowed, type-changed, enum-values-removed, removed-param, annotation-flip-to-destructive, output-schema-added/changed, tool-added/removed) + an injection/exfil marker scan over input schema, output schema, and description. Postures: Monitor / Guard (default) / Strict. Fail-closed.',
    'Install: one-click config-wire across Claude Desktop / Cursor / Cline / Zed (zero credentials change hands) or the SDK wrap() one-liner (TS + Python). See https://mcpindex.ai/docs.',
    'Tiered ladder: tier-0 deterministic contract-diff runs first; above it the cloud tier-1 corpus lookup, a tier-2 LLM consult on the ambiguous, and a tier-3 behavioral verifier that exercises a changed tool to clear or refute the change.',
    'Honest limits: contract_diff_not_safety_verdict (a HOLD means the contract CHANGED vs your pin, not that it is unsafe; the behavioral tier clears or refutes, it does not prove a tool safe); calibrated_false_v1 (confidence reported but not yet calibrated against a held-out corpus).',
    'Status: deterministic contract-diff dogfood-proven on Cursor; the full tiered ladder is live.',
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
