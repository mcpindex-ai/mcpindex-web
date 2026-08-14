// Identity rules for the generated per-server connect guides in content/guides/.
//
// WHY THIS EXISTS
// PR #92 merged the first five machine-generated "connect <server> to Claude Code" guides. Four
// named their server in the SEO metadata. The fifth,
// io-github-1lystore-mcp-server-with-claude-code, named it in NONE of them:
//
//     h1               "Connect to MCP Server"
//     title            "MCP Server Setup"
//     meta_description "Connect to MCP server"
//     outcome          "You will have the MCP server connected to Claude Code..."
//
// Its body was fine - correct npm package, correct env vars, genuinely 1ly.store-specific. Only
// the metadata was generic, which is the worst shape for this defect: the page looks complete in
// review and is indistinguishable from its siblings until you read the four fields that decide
// what it ranks for and what a reader sees in a result list. A guide that never names its subject
// competes with every other MCP guide for the same non-query and tells the one reader who does
// arrive nothing about which of 10,000 servers they are about to install.
//
// These files are artifacts: generated elsewhere, merged here by hand. Nothing in scripts/
// looked at them. Five landed, one was generic, no gate objected - and the generator will emit
// more. This module is the rule; scripts/check-guide-seo.mts is the gate that applies it to the
// guides a PR actually touches.
//
// WHAT IT ENFORCES, AND THE BOUND ON THAT CLAIM
// A graded guide must name its own server in the fields where every well-formed sibling already
// does. That is *identity present*, not *copy is good* - this cannot tell you the prose is worth
// reading, and it is not trying to. It is the difference between a page about something and a
// page about nothing, which is the failure that actually shipped.

/** Marks the generated per-server connect-guide family. Topical guides (how-to-trust-an-mcp-server,
 *  mcp-scanner-vs-gateway, ...) carry no server identity in their slug and are never graded. */
export const CONNECT_GUIDE_SUFFIX = '-with-claude-code';

/**
 * Slug segments that carry no identity. Every connect-guide slug is `io-github-<org>-<name>`, so
 * without this the vendor prefix alone would satisfy the check for every server on the registry.
 */
const STOPWORDS = new Set([
  'io',
  'github',
  'mcp',
  'server',
  'servers',
  'connect',
  'connecting',
  'setup',
  'guide',
  'to',
  'the',
  'with',
  'claude',
  'code',
  'for',
  'and',
  'your',
]);

/**
 * Two characters is not an identity. `infino-ai` yields `ai`, and "an AI-powered MCP server" is
 * prose any generator will emit for any server - it would satisfy the check while naming nothing.
 * (Note the matcher below is boundary-anchored, so the risk is a standalone "AI" in the copy, NOT
 * the letters inside "available" or "explain"; those never matched.)
 */
const MIN_TOKEN_LENGTH = 3;

/**
 * Used only when a slug yields no token at full length. A server legitimately named `x-ai` or
 * `d2` is not the author's mistake to fix - the slug comes from the registry id - so grading it
 * weakly beats hard-blocking a PR on advice nobody can act on.
 */
const FALLBACK_TOKEN_LENGTH = 2;

/** Present-and-non-empty is required; a missing optional field is a different defect, not this one. */
const REQUIRED_FIELDS = ['h1', 'meta_description'] as const;
const OPTIONAL_FIELDS = ['outcome'] as const;

export const GRADED_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;
export type GradedField = (typeof GRADED_FIELDS)[number];

export function isConnectGuideSlug(slug: string): boolean {
  return slug.endsWith(CONNECT_GUIDE_SUFFIX) && slug.length > CONNECT_GUIDE_SUFFIX.length;
}

/**
 * The identity tokens a connect guide must mention at least one of, derived from its own slug.
 *
 * Self-referential on purpose: the slug already carries the server identity, so the rule needs no
 * registry lookup, no network and no second source that can disagree with the file being graded.
 */
export function distinctiveTokens(slug: string): string[] {
  const base = isConnectGuideSlug(slug) ? slug.slice(0, -CONNECT_GUIDE_SUFFIX.length) : slug;
  const atLength = (min: number) => {
    const out = new Set<string>();
    for (const token of base.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length < min || STOPWORDS.has(token)) continue;
      out.add(token);
    }
    return [...out];
  };
  const strict = atLength(MIN_TOKEN_LENGTH);
  return strict.length ? strict : atLength(FALLBACK_TOKEN_LENGTH);
}

/**
 * The publisher's token - the one a generic page cannot accidentally satisfy.
 *
 * Connect-guide slugs are `io-github-<org>-<name>`, so after the vendor stopwords the FIRST
 * surviving token is the org's. That distinction is load-bearing: `<name>` is routinely an
 * English word (portfolio, weather, memory, search, calendar), and "Connect to the portfolio
 * MCP server" satisfies a name-token check while identifying nothing among the many servers
 * that share it. The org segment is the part that says *whose*.
 */
export function ownerToken(slug: string): string | null {
  return distinctiveTokens(slug)[0] ?? null;
}

/**
 * Whether `text` names `token` as a standalone run of characters.
 *
 * Boundaries are "not alphanumeric" rather than \b so the check reads through the punctuation
 * these names actually use: `io.github.1lystore/mcp-server` must match `1lystore` across a dot
 * and a slash, while `mainframe` must not match `main`.
 */
export function mentionsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

export interface IdentityFailure {
  field: GradedField;
  /** '' when the field is absent or blank, which is itself a failure for a required field. */
  value: string;
}

export interface IdentityGrade {
  /** False when the slug yields no token to grade against. The caller must fail loudly: a check
   *  that cannot check must never report a pass. */
  gradeable: boolean;
  tokens: string[];
  owner: string | null;
  failures: IdentityFailure[];
  /** True when NO graded field names the publisher, even though each field named something.
   *  This is the generic-placeholder case that a per-field check alone lets through. */
  ownerMissing: boolean;
}

/**
 * Grade one connect guide's metadata for its own server's identity.
 *
 * Two rules, and the second is the one with teeth:
 *
 *   per field   - each graded field must name SOMETHING from the slug.
 *   collective  - across the three, the PUBLISHER must be named at least once.
 *
 * The per-field rule alone is not enough, and the corpus proves it: with only that rule, a page
 * reading "Connect to the portfolio MCP server" in all three fields passes for
 * io-github-nirholas-portfolio-mcp while never once saying whose server it is. That is the same
 * shape of defect as the 1lystore page - metadata about no particular server - and it survived
 * only because `portfolio` is an ordinary English word. The 1lystore page was caught at all
 * because its org segment happened to be meaningless in English, which is luck, not a rule.
 *
 * The collective form is deliberate: it is satisfied by naming the publisher ONCE, so a merged
 * page like nirholas's `meta_description: "Setup three.ws Portfolio MCP"` - which names the
 * product rather than the org - still passes on the strength of its h1.
 *
 * `title` is deliberately NOT graded. io-github-infino-ai-mcp-server shipped `"mcp-server Setup"`,
 * which is weak but merged, and grading it would fail a PR for a page the author did not write.
 * The three fields here are the ones all five merged guides agree on.
 */
export function gradeConnectGuideIdentity(
  slug: string,
  guide: Readonly<Record<string, unknown>>,
): IdentityGrade {
  const tokens = distinctiveTokens(slug);
  const owner = tokens[0] ?? null;
  if (tokens.length === 0 || owner === null) {
    return { gradeable: false, tokens, owner: null, failures: [], ownerMissing: false };
  }

  const failures: IdentityFailure[] = [];
  let ownerNamed = false;
  for (const field of GRADED_FIELDS) {
    const raw = guide[field];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') {
      if ((REQUIRED_FIELDS as readonly string[]).includes(field)) failures.push({ field, value: '' });
      continue;
    }
    if (mentionsToken(value, owner)) ownerNamed = true;
    if (!tokens.some((token) => mentionsToken(value, token))) failures.push({ field, value });
  }
  return { gradeable: true, tokens, owner, failures, ownerMissing: !ownerNamed };
}
