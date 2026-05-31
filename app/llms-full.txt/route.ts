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
    'Pipeline: an LLM judge reads each tool description for hidden instructions today (findings semantic-only, status PARTIAL). A deterministic conformance probe is in build; the second leg does not yet run.',
    'History: OTS Bitcoin-anchored. Cadence bound = confirmation latency (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized). Sub-window precision asserted, not proven. In-process verify proves the proof carries a Bitcoin BlockHeaderAttestation; confirmation-depth check requires the relying party run their own Bitcoin node.',
    'Calibration: calibrated=false at v1. D3 graduation gate: >=150 conforming labels with FP upper-95 <=2%. Current: 15/150. Terminal-v1 trigger 2026-09-01: under 50 conforming = ships calibrated=false as terminal v1 (v2 graduation, not v1).',
    'Posture: advisory. The agent or IDE decides whether to act on the verdict.',
    'Endpoints:',
    '  - GET /api/v1/trust/tool/{server_id}/{tool_name}  per-tool verdict (v1 advisory returns UNVERIFIED).',
    '  - GET /api/v1/trust/server/{server_id}            server-level verdict (v1 advisory returns UNVERIFIED).',
    'Full method: https://mcpindex.ai/methodology',
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
