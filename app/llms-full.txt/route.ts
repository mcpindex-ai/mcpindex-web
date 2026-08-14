import { loadServers, loadSnapshotMeta } from '@/lib/registry';
import { loadGuides } from '@/lib/guides-content';
import type { Guide } from '@/lib/guides-content';
import { CATEGORY_LABELS } from '@/lib/categorize';
import { D3_REQUIRED_LABELS, D3_PROGRESS } from '@/lib/honest-limits';
// Same single declaration the trust/screen/preflight emitters read; see the note in
// lib/verdictContract.ts on why a second copy of this number is a bug, not a convenience.
import { VERDICT_CONTRACT_VERSION } from '@/lib/verdictContract';
import { gateInstallLine } from '@/lib/install/manifest';
import type { IndexedServer } from '@/lib/types';
import { createVersionedBodyCache } from '@/lib/llmsFullCache';

// This body is ~4MB and a cold render also pays a full loadServers() snapshot parse, so an hourly
// TTL plus a long stale-while-revalidate keeps the origin render off the request path entirely and
// bounds egress: the edge serves every fetcher from cache and refreshes in the background.
export const revalidate = 3600;

// Process-lifetime, version-keyed body cache with concurrent-build de-dup (see lib/llmsFullCache.ts).
const bodyCacheStore = createVersionedBodyCache();

function buildBody(servers: IndexedServer[], guides: Guide[]): string {
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
    gateInstallLine(),
    'Tiered ladder: tier-0 deterministic contract-diff is the live, deterministic leg and runs first. Above it the ladder is built as in-path seams - a cloud tier-1 corpus lookup, a tier-2 LLM consult on the ambiguous, and a tier-3 behavioral verifier that exercises a changed tool to clear or refute the change - but each is held off by default and requires explicit opt-in; the default build egresses nothing and stays fail-closed.',
    'Honest limits: contract_diff_not_safety_verdict (a HOLD means the contract CHANGED vs your pin, not that it is unsafe; when enabled, the behavioral tier clears or refutes, it does not prove a tool safe); tiers1to3_held_off_by_default_opt_in; default_build_egresses_nothing_fail_closed; calibrated_false_v1 (confidence reported but not yet calibrated against a held-out corpus).',
    'Status: tier-0 deterministic contract-diff is live and verified end-to-end against the live gate; tiers 1-3 are built but held off by default (opt-in).',
    '',
    '## Blast-Radius Grade (in-path; advisory, on by default)',
    '',
    'Alongside the contract-diff, the gate labels the blast radius of every tool call before the agent acts - what it would do (read, write, delete, send), whether it can be undone, and whether it leaves the machine. A read and an irreversible delete look identical to an agent until something labels them; this is that label.',
    'Method: a deterministic static classifier derived from the tool\'s own declared contract (name, description, input/output schema). It reads what a call WOULD do; it does not run the tool. Output is a typed action_type, side_effect_class, reversibility, and egress, plus a static autonomy ceiling. Deny-by-construction: every field is a typed enum/hash/bool, so no raw argument value can ride along in the grade.',
    'Posture: advisory and fail-closed - when the contract is ambiguous it grades toward the more dangerous class (assumes a write/irreversible), never down.',
    'Where it runs: on by default in the published clients - @mcp-index/sdk (TypeScript) and mcpindex-gate (Python). Deterministic, no network, no credentials.',
    'Honest limits: blast_radius_is_static_not_a_safety_verdict (it says what a call would do, read from the contract - not whether the contract is safe, and not what a specific call\'s runtime arguments will actually do); advisory_grade_orchestrator_decides (mcpindex labels the blast radius; your agent or IDE owns whether to allow, pause, or require approval).',
    '',
    '## Advisory directory screen (v1)',
    '',
    'Each server page exposes a verdict surface. Contract states: ALLOW / DENY / REVIEW / UNVERIFIED. At v1 every published verdict is REVIEW or UNVERIFIED - ALLOW and DENY are reserved, not produced.',
    `Verdict contract version: ${VERDICT_CONTRACT_VERSION}. Capability: check_tool_trust (via the npm MCP server - directory client, not the in-path gate).`,
    'Framework bindings: @mcp-index/mastra wires check_tool_trust into Mastra as a beforeToolCall hook (warn or enforce; fail-closed, no credentials). A client of the advisory screen, not the in-path gate; npm i @mcp-index/mastra.',
    'Pipeline (screen): today the screen is semantic-only - an LLM judge reads each tool description for hidden instructions. The deterministic conformance probe (drives the tool against its declared schema) is built but has NOT yet run on the public corpus, so no published screen verdict carries a conformance result; a clearing ALLOW (which the probe would earn) is not produced at v1. When the probe runs it is monitored, not enforced. Confidence is reported but not yet calibrated (calibrated=false).',
    'History: hash-chained; OTS Bitcoin anchoring built and committed, not yet confirmed per verdict. Cadence bound = confirmation latency (~10 min for pending; ~1 hour at N=6 confirmations for Bitcoin-finalized). Sub-window precision asserted, not proven. In-process verify proves the proof carries a Bitcoin BlockHeaderAttestation; confirmation-depth check requires the relying party run their own Bitcoin node.',
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

  // Guides: enumerate each intent page (title, description, URL, and any FAQ
  // Q&A) so answer engines can cite the specific guide, not just the section.
  if (guides.length) {
    parts.push('## Guides', '');
    for (const g of guides) {
      parts.push(`- ${g.title}`);
      if (g.metaDescription) parts.push(`  ${g.metaDescription}`);
      parts.push(`  https://mcpindex.ai/guides/${g.slug}`);
      if (g.faq?.length) {
        for (const f of g.faq) parts.push(`  Q: ${f.q}`, `  A: ${f.a}`);
      }
      parts.push('');
    }
  }

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
        // An LLM reading this catalog must not infer registry listing for a server that has
        // none. Emitted only for admitted entries, so the 18k registry lines are unchanged.
        ...(s.source === 'admitted'
          ? ['  provenance: NOT listed in the official MCP registry; indexed by mcpindex']
          : []),
        `  detail: https://mcpindex.ai/server/${s.slug}`,
        '',
      );
    }
  }
  return parts.join('\n');
}

export async function GET() {
  // loadServers() first so it populates the registry `_cache`; loadSnapshotMeta() then reads that
  // cache instead of resolving (and re-parsing the 22MB snapshot) a second time on a cold instance.
  const servers = await loadServers();
  const meta = await loadSnapshotMeta();

  const cached = await bodyCacheStore.resolve(meta.version, async () => {
    const guides = await loadGuides();
    return buildBody(servers, guides);
  });

  return new Response(cached.body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      // Reflect the version actually served (cached.version), not meta.version — under a rollover
      // that coincides with an in-flight build these can differ for one request.
      'X-Snapshot-Version': cached.version,
    },
  });
}
