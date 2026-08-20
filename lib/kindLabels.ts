// Human labels for the surfaced ChangeKind taxonomy. One label per member of
// SURFACE_CHANGE_KINDS and CONTEXT_SURFACE_CHANGE_KINDS (lib/changeKinds.ts) - parity is
// test-enforced in kindLabels.test.ts so a taxonomy addition can't silently ship an unlabeled
// raw token. Unknown codes still degrade gracefully (hyphens -> spaces) rather than hiding.
export const KIND_LABEL: Record<string, string> = {
  'added-required-param': 'new required input',
  'added-optional-param': 'new optional input',
  'removed-param': 'input removed',
  'type-changed': 'input type changed',
  'enum-values-removed': 'allowed values removed',
  'constraint-narrowed': 'input constraint tightened',
  'required-set-expanded': 'more inputs now required',
  'output-schema-changed': 'output shape changed',
  'output-schema-added': 'output shape added',
  'annotation-flip-to-destructive': 'now marked destructive',
  // Names the CONSEQUENCE, not the mechanism. The slug fallback would render
  // 'param mirrored to header', which is accurate and tells an operator nothing
  // about why it matters. Header values are read by every proxy on the path.
  'param-mirrored-to-header': 'a parameter value is now sent in an HTTP header',
  'tool-removed': 'tool removed',
  'deep-schema-undiffable': 'schema too nested to diff',
  // Server-scoped context-surface kinds (CONTEXT_SURFACE_CHANGE_KINDS). "Instructions"
  // alone reads like docs; name the consequence: this text is auto-injected into the
  // agent's context by the client on connect.
  'instructions-added': 'server now injects instructions into agent context',
  'instructions-changed': 'injected server instructions changed',
  'prompt-args-changed': 'prompt argument contract changed',
};

export function kindLabel(code: string): string {
  return KIND_LABEL[code] ?? code.replace(/-/g, ' ');
}
