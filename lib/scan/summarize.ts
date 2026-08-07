// Pure aggregation. Runs the vendored blast-radius classifier over tools and rolls
// servers + tools into the counts the UI and the share card render.

import { classify } from './vendor/actionClass';
import type { ToolDef } from './vendor/preflight-types';
import type { ScannedServer, ScannedTool, ScanSummary } from './types';

function asString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Risk-note codes the STATIC classifier can emit -> plain language. Two declared
// FACTS, never an inference verdict ("looks X") - the brand states the contract and
// lets the reader conclude. Probe/corpus/CVE notes never appear from a client-side
// classify(); if a future code shows up, noteLabel() humanizes it rather than hiding it.
const NOTE_LABEL: Record<string, string> = {
  annotation_contradicts_probe: 'annotation says read-only; schema exposes write/delete parameters',
  destructive_no_undo_path: 'destructive with no obvious undo path',
};

function noteLabel(code: string): string {
  return NOTE_LABEL[code] ?? code.replace(/_/g, ' ');
}

/** Grade a list of tools. `server` labels their origin when known. Total. */
export function classifyTools(tools: readonly ToolDef[], server: string | null = null): ScannedTool[] {
  return tools.map((t) => {
    // Mirror the SDK's classifyToolDef: a non-object inputSchema grades as `{}`, so the
    // web and the gate produce identical scope/pattern reads.
    const schema = isObj(t['inputSchema']) ? t['inputSchema'] : {};
    const ac = classify(asString(t['name']), asString(t['description']), schema, t['annotations']);
    return {
      server,
      name: asString(t['name']),
      actionType: ac.effective_action_type,
      sideEffect: ac.side_effect_class,
      reversibility: ac.reversibility,
      egress: ac.egress,
      autonomyCeiling: ac.autonomy_ceiling,
      notes: ac.known_risk_notes.map((n) => noteLabel(n.note_class)),
    };
  });
}

/** Roll a server inventory + graded tools into the summary. `level` is 'tool'
 * whenever any tool data is present, else 'server'. */
export function summarize(servers: readonly ScannedServer[], tools: readonly ScannedTool[]): ScanSummary {
  return {
    level: tools.length > 0 ? 'tool' : 'server',
    servers,
    tools,
    counts: {
      servers: servers.length,
      remoteServers: servers.filter((s) => s.transport === 'remote').length,
      localServers: servers.filter((s) => s.transport === 'local').length,
      serversWithSecrets: servers.filter((s) => s.secretKeys.length > 0).length,
      insecureRemotes: servers.filter((s) => s.insecureTransport).length,
      secretsInFile: servers.filter((s) => s.secretsInFile.length > 0).length,
      fetchAtLaunch: servers.filter((s) => s.fetchesAtLaunch).length,
      internetReach: servers.filter((s) => s.reach === 'internet').length,
      loopbackServers: servers.filter((s) => s.reach === 'loopback').length,
      broadFileAccess: servers.filter((s) => s.pathScope === 'broad').length,
      gatedServers: servers.filter((s) => s.gated).length,
      tools: tools.length,
      irreversible: tools.filter((t) => t.reversibility === 'irreversible').length,
      egressExternal: tools.filter((t) => t.egress === 'external').length,
      destructive: tools.filter((t) => t.sideEffect === 'destructive').length,
      readOnly: tools.filter((t) => t.sideEffect === 'none').length,
      needsApproval: tools.filter(
        (t) => t.autonomyCeiling === 'needs-approval' || t.autonomyCeiling === 'never-unattended',
      ).length,
      unpinned: tools.length, // a fresh scan pins nothing - every tool is unwatched
    },
  };
}
