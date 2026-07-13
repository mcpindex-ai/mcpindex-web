/**
 * Tier 0a — the static action classifier (TS port of `cse.action_class`).
 *
 * Grades the *action* a tool would take (its blast radius), not just whether the
 * tool is trustworthy. Pure, deterministic, model-free, total (never throws on
 * hostile input). Reuses the structural risk leg (`risk.assess`) + the name-token
 * lexicon (`lexicon.nameTokens`) and maps them into the spec's action-classification
 * schema (action_type / resource / side-effect / reversibility / egress + a STATIC,
 * fail-closed autonomy_ceiling).
 *
 * ADVISORY only: it rides ALONGSIDE the gate decision and NEVER moves PROCEED/HOLD.
 * The `autonomy_ceiling` here is the STATIC cold-start default; the calibration-backed
 * ceiling lives in the private moat and is structurally unreachable from the SDK.
 *
 * Cross-language parity: the value tables and derivation ladder mirror
 * `corpus_eval/tooling/cse/action_class.py` byte-for-byte. Keep them in lockstep.
 */

// VENDORED from @mcp-index/sdk (mcpindex-trust/clients/ts/src/actionClass.ts @ ead501e,
// sha1 816f13fe). Logic byte-exact with the SDK; only (a) import extensions stripped for the
// web's bundler resolution, (b) the env-gated helpers `actionClassificationEnabled` /
// `classifyToolDef` OMITTED (they touch process.env; the web tool calls classify() directly,
// so the feature is always-on here). The SDK is the source of truth; parity test guards drift.

import { assess, blastRank, BlastRadius, DomainClass, type RiskAssessment } from "./risk";
import { nameTokens } from "./lexicon";
import type { ActionClassification } from "./preflight-types";

// ----------------------------------------------------------------------- enums

export enum ActionType {
  READ = "read",
  LIST = "list",
  SEARCH = "search",
  WRITE = "write",
  UPDATE = "update",
  DELETE = "delete",
  SEND = "send",
  EXECUTE = "execute",
  AUTH = "auth",
  ADMIN = "admin",
  UNKNOWN = "unknown",
}

export enum SideEffectClass {
  NONE = "none",
  LOCAL_WRITE = "local-write",
  OUTBOUND = "outbound",
  DESTRUCTIVE = "destructive",
}

export enum Reversibility {
  REVERSIBLE = "reversible",
  HARD_TO_REVERSE = "hard-to-reverse",
  IRREVERSIBLE = "irreversible",
}

export enum Egress {
  NONE = "none",
  INTERNAL = "internal",
  EXTERNAL = "external",
}

export enum ScopeHint {
  NARROW = "narrow",
  BROAD = "broad",
  UNBOUNDED = "unbounded",
}

export enum PatternShape {
  LITERAL = "literal",
  SINGLE_ARG = "single-arg",
  GLOB = "glob",
  WILDCARD = "wildcard",
  TEMPLATED = "templated",
}

export enum AutonomyCeiling {
  DISCOVERY = "discovery",
  REVERSIBLE = "reversible",
  NEEDS_APPROVAL = "needs-approval",
  NEVER_UNATTENDED = "never-unattended",
}

export enum NoteClass {
  DESTRUCTIVE_NO_UNDO_PATH = "destructive_no_undo_path",
  ANNOTATION_CONTRADICTS_PROBE = "annotation_contradicts_probe",
  KNOWN_CVE = "known_cve",
  OBSERVED_EXFIL = "observed_exfil",
  SCOPE_ESCAPE = "scope_escape",
}

export enum Severity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum EvidenceRefType {
  PROBE = "probe",
  SCHEMA_FLAG = "schema_flag",
  CORPUS_CELL = "corpus_cell",
  CVE = "cve",
}

// ------------------------------------------------------- derivation primitives

// Verb token -> action_type. Most-destructive wins on multi-match (see DESTRUCT_RANK).
const VERB_TO_TYPE: ReadonlyArray<readonly [ActionType, ReadonlySet<string>]> = [
  [ActionType.DELETE, new Set("delete remove drop destroy purge wipe truncate prune".split(" "))],
  [ActionType.EXECUTE, new Set("exec execute run eval".split(" "))],
  [ActionType.ADMIN, new Set("provision deploy terminate reboot scale kill".split(" "))],
  [ActionType.AUTH, new Set("authorize grant revoke issue".split(" "))],
  [ActionType.SEND, new Set("send post publish notify dispatch email broadcast tweet sms message".split(" "))],
  [ActionType.WRITE, new Set("write create insert upload put".split(" "))],
  [ActionType.UPDATE, new Set("update modify patch merge set".split(" "))],
  [ActionType.SEARCH, new Set("search query lookup find".split(" "))],
  [ActionType.LIST, new Set("list".split(" "))],
  [ActionType.READ, new Set("get read fetch describe show view".split(" "))],
];

// Descending destructiveness — tiebreak for the "effective" action_type and the
// fail-closed ordering. UNKNOWN is most severe (we could not classify it).
const DESTRUCT_ORDER: readonly ActionType[] = [
  ActionType.UNKNOWN,
  ActionType.DELETE,
  ActionType.EXECUTE,
  ActionType.ADMIN,
  ActionType.AUTH,
  ActionType.SEND,
  ActionType.WRITE,
  ActionType.UPDATE,
  ActionType.SEARCH,
  ActionType.LIST,
  ActionType.READ,
];
const DESTRUCT_RANK: ReadonlyMap<ActionType, number> = new Map(
  DESTRUCT_ORDER.map((t, i) => [t, i]),
);

const READ_TYPES: ReadonlySet<ActionType> = new Set([
  ActionType.READ,
  ActionType.LIST,
  ActionType.SEARCH,
]);

// Defense-in-depth caps on the attacker-controlled tool name + schema.
const MAX_NAME = 8192; // chars of name tokenized (mirrors risk MAX_TEXT)
const MAX_PROPS = 512; // top-level schema property keys scanned before fail-closed

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/** Read a boolean MCP annotation hint; total, fail-safe (non-object / missing /
 * non-bool -> false). */
function annotationBool(annotations: unknown, key: string): boolean {
  if (isPlainObject(annotations)) {
    const v = annotations[key];
    if (typeof v === "boolean") return v;
  }
  return false;
}

/** Precedence ladder, deterministic legs only (annotations advisory-UP + verb-keyword
 * over name). A self-declared readOnlyHint can NEVER lower a class the verb raises;
 * destructiveHint:true floors the effective type at DELETE. No verb match -> UNKNOWN. */
export function deriveActionTypes(
  name: string,
  annotations: unknown = null,
): [ActionType[], ActionType] {
  const tokens = nameTokens(name.slice(0, MAX_NAME));
  const matched = new Set<ActionType>();
  for (const [t, verbs] of VERB_TO_TYPE) {
    if (intersects(tokens, verbs)) matched.add(t);
  }
  if (annotationBool(annotations, "destructiveHint")) matched.add(ActionType.DELETE);

  if (matched.size === 0) return [[ActionType.UNKNOWN], ActionType.UNKNOWN];

  const ordered = [...matched].sort(
    (a, b) => (DESTRUCT_RANK.get(a) ?? 0) - (DESTRUCT_RANK.get(b) ?? 0),
  );
  return [ordered, ordered[0]];
}

/** Coarse static scope/pattern shape from the schema's top-level params. Conservative:
 * no arg values, no deep walk. Fail-closed for non-trivial / pathological schemas. */
function scopePattern(inputSchema: unknown): [ScopeHint, PatternShape] {
  if (!isPlainObject(inputSchema)) return [ScopeHint.BROAD, PatternShape.TEMPLATED];
  const props = inputSchema["properties"];
  if (!isPlainObject(props) || Object.keys(props).length === 0) {
    return [ScopeHint.NARROW, PatternShape.LITERAL];
  }
  const keys = Object.keys(props);
  if (keys.length > MAX_PROPS) return [ScopeHint.UNBOUNDED, PatternShape.WILDCARD];
  const names = new Set(keys.map((k) => k.toLowerCase()));
  const globIsh = new Set(["glob", "pattern", "wildcard", "regex"]);
  const multiIsh = new Set(["ids", "keys", "paths", "targets", "filters", "query"]);
  if (intersects(names, globIsh)) return [ScopeHint.UNBOUNDED, PatternShape.GLOB];
  for (const nm of names) {
    const spec = props[nm];
    if (isPlainObject(spec) && spec["type"] === "array") {
      return [ScopeHint.UNBOUNDED, PatternShape.WILDCARD];
    }
  }
  if (intersects(names, multiIsh)) return [ScopeHint.BROAD, PatternShape.WILDCARD];
  return [ScopeHint.NARROW, PatternShape.SINGLE_ARG];
}

function sideEffectClass(eff: ActionType, ra: RiskAssessment): SideEffectClass {
  if (READ_TYPES.has(eff) && ra.looksReadOnly) return SideEffectClass.NONE;
  if (eff === ActionType.DELETE || eff === ActionType.EXECUTE || eff === ActionType.ADMIN) {
    return SideEffectClass.DESTRUCTIVE;
  }
  if (ra.domainClass === DomainClass.PAYMENTS) return SideEffectClass.DESTRUCTIVE;
  if (eff === ActionType.SEND || ra.domainClass === DomainClass.COMMS) {
    return SideEffectClass.OUTBOUND;
  }
  if (eff === ActionType.WRITE || eff === ActionType.UPDATE || eff === ActionType.AUTH) {
    return SideEffectClass.LOCAL_WRITE;
  }
  // Fallthrough: a read-NAMED tool the risk leg refused to confirm read-only, or an
  // UNKNOWN type. Fail closed to local-write (UNKNOWN is floored to never-unattended
  // downstream by the ceiling).
  return SideEffectClass.LOCAL_WRITE;
}

function reversibility(eff: ActionType, sec: SideEffectClass): Reversibility {
  if (
    eff === ActionType.DELETE ||
    eff === ActionType.EXECUTE ||
    eff === ActionType.ADMIN ||
    eff === ActionType.AUTH
  ) {
    return Reversibility.IRREVERSIBLE;
  }
  if (sec === SideEffectClass.DESTRUCTIVE) return Reversibility.IRREVERSIBLE;
  if (sec === SideEffectClass.OUTBOUND || eff === ActionType.WRITE || eff === ActionType.UPDATE) {
    return Reversibility.HARD_TO_REVERSE;
  }
  return Reversibility.REVERSIBLE;
}

function egressOf(eff: ActionType, sec: SideEffectClass): Egress {
  if (sec === SideEffectClass.OUTBOUND) return Egress.EXTERNAL;
  if (READ_TYPES.has(eff) && sec === SideEffectClass.NONE) return Egress.NONE;
  return Egress.INTERNAL;
}

/** Cold-start fail-closed lattice. UNKNOWN / HIGH-blast-irreversible / execute ->
 * never-unattended; then by side-effect/reversibility, fail-closed. */
function staticCeiling(
  eff: ActionType,
  sec: SideEffectClass,
  rev: Reversibility,
  blast: BlastRadius,
): AutonomyCeiling {
  if (eff === ActionType.UNKNOWN) return AutonomyCeiling.NEVER_UNATTENDED;
  if (rev === Reversibility.IRREVERSIBLE && blastRank(blast) >= blastRank(BlastRadius.HIGH)) {
    return AutonomyCeiling.NEVER_UNATTENDED;
  }
  if (eff === ActionType.EXECUTE) return AutonomyCeiling.NEVER_UNATTENDED;
  if (rev === Reversibility.IRREVERSIBLE || sec === SideEffectClass.OUTBOUND) {
    return AutonomyCeiling.NEEDS_APPROVAL;
  }
  if (sec === SideEffectClass.LOCAL_WRITE || rev === Reversibility.HARD_TO_REVERSE) {
    return AutonomyCeiling.REVERSIBLE;
  }
  return AutonomyCeiling.DISCOVERY;
}

function resourceKind(ra: RiskAssessment): string {
  return ra.domainClass !== DomainClass.UNKNOWN ? ra.domainClass : "unknown";
}

type EvidenceRef = { readonly ref_type: string; readonly ref_id: string };

function evidence(ra: RiskAssessment, eff: ActionType): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  if (ra.nameWriteish) refs.push({ ref_type: EvidenceRefType.SCHEMA_FLAG, ref_id: "name_writeish" });
  if (ra.hasWritePayloadParam) {
    refs.push({ ref_type: EvidenceRefType.SCHEMA_FLAG, ref_id: "write_payload_param" });
  }
  if (ra.requiresCredential) {
    refs.push({ ref_type: EvidenceRefType.SCHEMA_FLAG, ref_id: "requires_credential" });
  }
  if (ra.domainClass !== DomainClass.UNKNOWN) {
    refs.push({ ref_type: EvidenceRefType.SCHEMA_FLAG, ref_id: `domain.${ra.domainClass}` });
  }
  refs.push({ ref_type: EvidenceRefType.SCHEMA_FLAG, ref_id: `action.${eff}` });
  return refs.slice(0, 16);
}

type KnownRiskNote = {
  readonly note_class: string;
  readonly severity: string;
  readonly source: EvidenceRef;
  readonly provenance: string;
};

function riskNotes(
  eff: ActionType,
  sec: SideEffectClass,
  annotations: unknown,
): KnownRiskNote[] {
  const notes: KnownRiskNote[] = [];
  if (annotationBool(annotations, "readOnlyHint") && sec !== SideEffectClass.NONE) {
    notes.push({
      note_class: NoteClass.ANNOTATION_CONTRADICTS_PROBE,
      severity: Severity.HIGH,
      source: { ref_type: EvidenceRefType.SCHEMA_FLAG, ref_id: "readonly_hint_vs_writeish" },
      provenance: "derived",
    });
  }
  if (sec === SideEffectClass.DESTRUCTIVE) {
    notes.push({
      note_class: NoteClass.DESTRUCTIVE_NO_UNDO_PATH,
      severity: Severity.MEDIUM,
      source: { ref_type: EvidenceRefType.SCHEMA_FLAG, ref_id: `action.${eff}` },
      provenance: "derived",
    });
  }
  return notes;
}

/** Static action classification (Tier 0a). Pure, deterministic, total. The
 * autonomy_ceiling is the STATIC cold-start default (basis="static"). */
export function classify(
  name: string,
  description: string,
  inputSchema: unknown,
  annotations: unknown = null,
): ActionClassification {
  const ra = assess(name, description, inputSchema);
  const [types, eff] = deriveActionTypes(name, annotations);
  const [scope, pattern] = scopePattern(inputSchema);
  const sec = sideEffectClass(eff, ra);
  const rev = reversibility(eff, sec);
  const egress = egressOf(eff, sec);
  const ceiling = staticCeiling(eff, sec, rev, ra.blastRadius);

  return {
    action_types: types,
    effective_action_type: eff,
    resource: { kind: resourceKind(ra), pattern, scope_hint: scope },
    side_effect_class: sec,
    reversibility: rev,
    egress,
    autonomy_ceiling: ceiling,
    autonomy_ceiling_basis: "static",
    known_risk_notes: riskNotes(eff, sec, annotations),
    evidence: evidence(ra, eff),
  };
}
