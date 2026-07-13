// VENDORED VERBATIM from @mcp-index/sdk (mcpindex-trust/clients/ts/src/risk.ts @ ead501e,
// sha1 bc550ec0). Pure, no I/O, browser-safe. Only the import extension was stripped for the
// web's bundler resolution. The SDK is the source of truth; the parity test guards divergence.

/**
 * Structural risk leg — a port of Python `tooling/cse/risk.py`. Pure,
 * deterministic, total (never throws on a malformed/hostile schema), fail-closed
 * (absence of a positive read signal resolves toward higher risk). The gate uses
 * it for the Gate-3 risk-escalation check on an otherwise-benign drift.
 */

import { nameTokens, sideEffectStems, nameIsWriteish, hasSideEffectIntent } from "./lexicon";

const MAX_TEXT = 8192;
const WALK_MAX_NODES = 2000;
const WALK_HARD_DEPTH = 12;

const WRITE_PAYLOAD_PARAMS = new Set(
  (
    "content body payload file attachment upload destination recipient amount " +
    "email message sms subject html markdown document blob bytes " +
    "command cmd code script exec eval sql shell expr"
  ).split(" "),
);

const CREDENTIAL_TOKENS = new Set(
  (
    "token apikey credential credentials secret bearer oauth password passwd " +
    "auth authorization key"
  ).split(" "),
);

const DOMAIN_TOKENS: Record<string, Set<string>> = {
  payments: new Set(
    ("pay payment charge invoice billing wallet refund transaction transfer " +
      "deposit withdraw checkout purchase escrow disburse settle").split(" "),
  ),
  infra: new Set(
    ("deploy provision server container cluster instance kubernetes k8s vm " +
      "node terminate reboot scale infra infrastructure dns").split(" "),
  ),
  comms: new Set(
    ("email mail message send notify notification sms slack webhook post tweet " +
      "publish broadcast dm").split(" "),
  ),
  data: new Set(
    ("read get list query fetch search lookup describe show view data record " +
      "index dataset row table report metric stats history").split(" "),
  ),
};
const DOMAIN_PRECEDENCE = ["payments", "infra", "comms", "data"];

export enum BlastRadius {
  LOW = "low",
  MED = "med",
  HIGH = "high",
}

export enum DomainClass {
  PAYMENTS = "payments",
  INFRA = "infra",
  COMMS = "comms",
  DATA = "data",
  UNKNOWN = "unknown",
}

const BLAST_RANK: Record<BlastRadius, number> = {
  [BlastRadius.LOW]: 0,
  [BlastRadius.MED]: 1,
  [BlastRadius.HIGH]: 2,
};

export function blastRank(blast: BlastRadius): number {
  return BLAST_RANK[blast];
}

export interface RiskAssessment {
  readonly nameWriteish: boolean;
  readonly hasWritePayloadParam: boolean;
  readonly requiresCredential: boolean;
  readonly sideEffectIntent: boolean;
  readonly domainClass: DomainClass;
  readonly blastRadius: BlastRadius;
  readonly looksReadOnly: boolean;
  readonly signals: readonly string[];
}

function stemmed(tokens: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const t of tokens) {
    for (const s of sideEffectStems(t)) out.add(s);
  }
  return out;
}

function intersect(a: Set<string>, b: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function isDict(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function schemaParamTokens(inputSchema: unknown): [Set<string>, boolean] {
  const tokens = new Set<string>();
  const budget = { n: WALK_MAX_NODES };
  let truncated = false;

  const walk = (node: unknown, depth: number): void => {
    if (budget.n <= 0 || depth >= WALK_HARD_DEPTH) {
      truncated = true;
      return;
    }
    budget.n -= 1;
    if (!isDict(node)) return;
    const props = node["properties"];
    if (isDict(props)) {
      for (const [key, sub] of Object.entries(props)) {
        for (const t of nameTokens(key)) tokens.add(t);
        walk(sub, depth + 1);
      }
    }
    const items = node["items"];
    if (isDict(items)) walk(items, depth + 1);
    else if (Array.isArray(items)) for (const it of items) walk(it, depth + 1);
    for (const comp of ["oneOf", "anyOf", "allOf", "prefixItems"]) {
      const branches = node[comp];
      if (Array.isArray(branches)) for (const it of branches) walk(it, depth + 1);
    }
    const ap = node["additionalProperties"];
    if (isDict(ap)) walk(ap, depth + 1);
  };

  if (isDict(inputSchema)) walk(inputSchema, 0);
  return [tokens, truncated];
}

function classifyDomain(ndTokens: Set<string>): DomainClass {
  const stems = stemmed(ndTokens);
  for (const dom of DOMAIN_PRECEDENCE) {
    if ([...stems].some((s) => DOMAIN_TOKENS[dom].has(s))) {
      return dom as DomainClass;
    }
  }
  return DomainClass.UNKNOWN;
}

function union(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set(a);
  for (const x of b) out.add(x);
  return out;
}

/** Structural risk assessment (port of `risk.assess`). */
export function assess(
  name: string,
  description: string,
  inputSchema: unknown,
): RiskAssessment {
  name = name.slice(0, MAX_TEXT);
  description = description.slice(0, MAX_TEXT);
  const ndTokens = union(nameTokens(name), nameTokens(description));
  const [paramTokens, truncated] = schemaParamTokens(inputSchema);

  const nameWriteish = nameIsWriteish(name);
  const sideEffectIntent = hasSideEffectIntent(name, description);
  const matchedPayload = intersect(stemmed(paramTokens), WRITE_PAYLOAD_PARAMS);
  const hasWritePayloadParam = matchedPayload.size > 0 || truncated;
  const requiresCredential =
    intersect(stemmed(union(ndTokens, paramTokens)), CREDENTIAL_TOKENS).size > 0;
  const domainClass = classifyDomain(ndTokens);

  let blast: BlastRadius;
  if (domainClass === DomainClass.PAYMENTS || (nameWriteish && requiresCredential)) {
    blast = BlastRadius.HIGH;
  } else if (
    nameWriteish ||
    hasWritePayloadParam ||
    sideEffectIntent ||
    domainClass === DomainClass.INFRA ||
    domainClass === DomainClass.COMMS ||
    domainClass === DomainClass.UNKNOWN
  ) {
    blast = BlastRadius.MED;
  } else {
    blast = BlastRadius.LOW;
  }

  const looksReadOnly =
    domainClass === DomainClass.DATA &&
    !nameWriteish &&
    !hasWritePayloadParam &&
    !sideEffectIntent;

  const signals: string[] = [];
  if (nameWriteish) signals.push("name carries a mutating verb");
  if (matchedPayload.size > 0)
    signals.push(`write/actionable param present ([${[...matchedPayload].sort().map((s) => `'${s}'`).join(", ")}])`);
  if (truncated) signals.push("schema too large/deep to fully analyze (fail-closed)");
  if (sideEffectIntent) signals.push("name/description carries side-effecting intent");
  if (requiresCredential) signals.push("requires a credential to act");
  if (domainClass !== DomainClass.UNKNOWN) signals.push(`domain=${domainClass}`);
  if (looksReadOnly) signals.push("structurally read-only (read-ish domain, no write signal)");

  return {
    nameWriteish,
    hasWritePayloadParam,
    requiresCredential,
    sideEffectIntent,
    domainClass,
    blastRadius: blast,
    looksReadOnly,
    signals,
  };
}
