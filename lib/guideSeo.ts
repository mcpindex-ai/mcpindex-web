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
// more. This module is the rule; scripts/check-guide-seo.ts is the gate that applies it to the
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
 * Two characters is not an identity. `infino-ai` yields `ai`, which appears inside "available",
 * "main" and "explain" - a bare substring test would have passed the 1lystore page on prose that
 * never mentions it. Three is the shortest length that has never produced an accidental match
 * across the corpus.
 */
const MIN_TOKEN_LENGTH = 3;

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
  const out = new Set<string>();
  for (const token of base.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < MIN_TOKEN_LENGTH) continue;
    if (STOPWORDS.has(token)) continue;
    out.add(token);
  }
  return [...out];
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
  failures: IdentityFailure[];
}

/**
 * Grade one connect guide's metadata for its own server's identity.
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
  if (tokens.length === 0) return { gradeable: false, tokens, failures: [] };

  const failures: IdentityFailure[] = [];
  for (const field of GRADED_FIELDS) {
    const raw = guide[field];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') {
      if ((REQUIRED_FIELDS as readonly string[]).includes(field)) failures.push({ field, value: '' });
      continue;
    }
    if (!tokens.some((token) => mentionsToken(value, token))) failures.push({ field, value });
  }
  return { gradeable: true, tokens, failures };
}
