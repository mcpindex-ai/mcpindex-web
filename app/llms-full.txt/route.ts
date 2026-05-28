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
    'Each server page exposes a verdict surface (allow / deny / review) once the hybrid eval has run.',
    'Verdict contract version: 1.0.0. Capability: check_tool_trust (via the npm MCP server).',
    'Pipeline: deterministic conformance probe + LLM judge. Both legs execute; conformance is monitored, not enforced.',
    'History: OTS Bitcoin-anchored, cadence bound = confirmation latency (~10 min to ~1 hour). Sub-window timing is asserted, not proven.',
    'Calibration: calibrated=false at v1. D3 graduation gate: >=150 conforming labels with FP upper-95 <=2%. Current: 15/150.',
    'Posture: advisory. The agent or IDE decides whether to act on the verdict.',
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
