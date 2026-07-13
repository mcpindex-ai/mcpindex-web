// VENDORED from @mcp-index/sdk (mcpindex-trust/clients/ts/src/preflight.ts @ ead501e).
// Only the two types the static classifier needs. Keep in lockstep with the SDK.
// The SDK is the source of truth; do not edit logic here — see ./README.md.

/** A tool definition as reported by an MCP server (`tools/list` entry). */
export type ToolDef = Record<string, unknown>;

/** Static action classification — the tool's blast radius. Deterministic, model-free.
 * A CONTRACT-DIFF style fact, never a "safe/unsafe" verdict. */
export interface ActionClassification {
  readonly action_types: readonly string[];
  readonly effective_action_type: string;
  readonly resource: {
    readonly kind: string;
    readonly pattern: string;
    readonly scope_hint: string;
  };
  readonly side_effect_class: string;
  readonly reversibility: string;
  readonly egress: string;
  readonly autonomy_ceiling: string;
  readonly autonomy_ceiling_basis: string;
  readonly known_risk_notes: readonly {
    readonly note_class: string;
    readonly severity: string;
    readonly source: { readonly ref_type: string; readonly ref_id: string };
    readonly provenance: string;
  }[];
  readonly evidence: readonly { readonly ref_type: string; readonly ref_id: string }[];
}
