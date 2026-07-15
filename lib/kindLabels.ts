// Human labels for the surfaced ChangeKind taxonomy. One label per member of
// SURFACE_CHANGE_KINDS (lib/changeKinds.ts) - parity is test-enforced in kindLabels.test.ts so a
// taxonomy addition can't silently ship an unlabeled raw token. Unknown codes still degrade
// gracefully (hyphens -> spaces) rather than hiding.
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
  'tool-removed': 'tool removed',
  'deep-schema-undiffable': 'schema too nested to diff',
};

export function kindLabel(code: string): string {
  return KIND_LABEL[code] ?? code.replace(/-/g, ' ');
}
