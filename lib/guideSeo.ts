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
// arrive nothing about which of 21,000 servers they are about to install.
//
// These files are artifacts: generated elsewhere, merged here by hand. Nothing in scripts/
// looked at them. Five landed, one was generic, no gate objected - and the generator will emit
// more. This module is the rule; scripts/check-guide-seo.mts is the gate that applies it to the
// guides a PR actually touches.
//
// WHY THE PUBLISHER, AND WHY IT COMES FROM THE REGISTRY
// Two rounds of review killed two weaker versions of this rule, and both failures are worth
// keeping written down because both looked right:
//
//   1. "each field must name SOMETHING from the slug" passes a page reading "Connect to the
//      portfolio MCP server" for io-github-nirholas/portfolio-mcp - metadata about no particular
//      server, i.e. the original defect, surviving because `portfolio` is an ordinary English
//      word. The 1lystore page was caught at all only because `1lystore` is meaningless in
//      English. That is luck, not a rule.
//
//   2. "the publisher is the first distinctive token of the slug" is false for a FIFTH of the
//      registry. Ids are reverse-DNS, and only io.github.* puts the publisher third. Measured
//      against data/slugmap.json: of 21,290 ids, 4,219 resolve to the namespace prefix instead
//      of the publisher - `com` (2,765), `app` (370), `dev` (291), `org`, `net`, `live`, `xyz`.
//      A guide for com.1stdibs/1stDibs would have satisfied the rule with the bare word "com".
//
//   3. "the publisher is the LAST namespace label" then picks infrastructure: `ai.alpic.mcp`
//      -> `mcp` (83 ids), `com.nvidia.ngc.nsight.copilot.api` -> `api` (34), `...www` (47),
//      `io.sslip.195.82.231.168` -> `168`. `mcp` is the very word the boilerplate contains, so
//      that rule does not merely miss - it inverts, and passes the generic page outright.
//
// So the publisher is read from the registry id, where it is stated rather than guessed:
// `io.github.1lystore/mcp-server` -> `1lystore`, `com.1stdibs/1stDibs` -> `1stdibs`. The gate
// resolves slug -> id through data/slugmap.json and passes the result in; this module stays pure.
//
// WHAT IT ENFORCES, AND THE BOUND ON THAT CLAIM
// A graded guide must name its publisher in at least two of its three fields (one, if it carries
// only the two required ones), and every graded field must name something identifying. That is
// *identity present*, not *copy is good* - this cannot tell you the prose is worth reading, and
// it is not trying to. It is the difference between a page about something and a page about
// nothing, which is the failure that shipped.

/** Marks the generated per-server connect-guide family. Topical guides (how-to-trust-an-mcp-server,
 *  mcp-scanner-vs-gateway, ...) carry no server identity in their slug and are never graded. */
export const CONNECT_GUIDE_SUFFIX = '-with-claude-code';

/**
 * Slug segments that carry no identity: the vendor prefix, plus the reverse-DNS namespace
 * prefixes that head two thirds of the non-github registry. Without the latter, `com` alone
 * would satisfy the check for 2,765 servers.
 */
const STOPWORDS = new Set([
  // vendor / product noise
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
  // reverse-DNS namespace prefixes
  'com',
  'app',
  'dev',
  'org',
  'net',
  'live',
  'xyz',
  'tech',
  'cloud',
  'sh',
  'ai',
  'co',
  'me',
]);

/**
 * Two characters is not an identity. `infino-ai` yields `ai`, and "an AI-powered MCP server" is
 * prose any generator will emit for any server - it would satisfy the check while naming nothing.
 * (Note the matcher below is boundary-anchored, so the risk is a standalone "AI" in the copy, NOT
 * the letters inside "available" or "explain"; those never matched.)
 */
const MIN_TOKEN_LENGTH = 3;

/** Present-and-non-empty is required; a missing optional field is a different defect, not this one. */
const REQUIRED_FIELDS = ['h1', 'meta_description'] as const;
const OPTIONAL_FIELDS = ['outcome'] as const;

export const GRADED_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;
export type GradedField = (typeof GRADED_FIELDS)[number];

/**
 * How many graded fields must name the publisher.
 *
 * Two, not three, and not one. One lets `meta_description` - the search-result snippet, the whole
 * point of the exercise - stay pure boilerplate. Three fails a merged page: nirholas's
 * `meta_description` is "Setup three.ws Portfolio MCP", which names the product rather than the
 * org and is perfectly good copy. Measured over the five merged guides: 3/3, 3/3, 3/3, 3/3, 2/3.
 */
const OWNER_MENTIONS_REQUIRED = 2;

export function isConnectGuideSlug(slug: string): boolean {
  return slug.endsWith(CONNECT_GUIDE_SUFFIX) && slug.length > CONNECT_GUIDE_SUFFIX.length;
}

/**
 * Namespace labels that are infrastructure, never a publisher. Deployment and platform labels sit
 * in the same position an org would, so "last label" alone picks them: `ai.alpic.mcp` -> `mcp`
 * (83 real ids), `com.nvidia.ngc.nsight.copilot.api` -> `api` (34), `br.com.escoladeradio.www`
 * -> `www` (47). Taking those as the publisher is worse than useless - `mcp` is the exact word
 * the boilerplate already contains, so the whole rule inverts and a generic page passes.
 */
const INFRA_LABELS = new Set([
  'mcp',
  'app',
  'api',
  'www',
  'staging',
  'cdn',
  'server',
  'servers',
  'ai',
  'io',
  'sh',
  'co',
  'dev',
  'cloud',
  'tools',
  'demo',
  'test',
]);

/** `live.alpic.staging.mcp-server-6283dc54` - a deployment id, not a name. */
const DEPLOY_ARTIFACT = /-[0-9a-f]{8}$/;

/**
 * The publisher, read from a reverse-DNS registry id.
 *
 * Two shapes, because the registry has two. `io.github.*` is 69% of it (14,856 of 21,290) and is
 * exactly regular: the publisher is the third label, always, and is taken verbatim WITHOUT any
 * filtering - `io.github.github/github-mcp-server` is a real id whose publisher really is called
 * `github`, and a filtered rule cannot grade it at all. Everything else is walked right-to-left,
 * skipping infrastructure labels, purely numeric labels and deployment artifacts, and never
 * considering the leading label (which is the TLD in a reverse-DNS name).
 *
 * Resolves 21,275 of 21,290 ids. The remaining 15 (`ai.1325/mcp`, `bot.402/...`) get null, which
 * disables the publisher rule for that guide rather than blocking it - see gradeConnectGuideIdentity.
 */
export function ownerFromRegistryId(registryId: string): string | null {
  const labels = registryId.split('/')[0].split('.').filter(Boolean);
  if (labels.length === 0) return null;
  if (labels.length >= 3 && labels[0] === 'io' && labels[1] === 'github') {
    return labels[2].toLowerCase();
  }
  const candidates = labels.length > 1 ? labels.slice(1) : labels;
  for (let i = candidates.length - 1; i >= 0; i--) {
    const label = candidates[i].toLowerCase();
    if (INFRA_LABELS.has(label) || /^\d+$/.test(label) || DEPLOY_ARTIFACT.test(label)) continue;
    return label;
  }
  return null;
}

/**
 * Identity tokens from the slug itself. Used for the weaker per-field check, and as the fallback
 * publisher when a slug is not in the registry snapshot (a guide can be generated for a server
 * newer than the last snapshot). Order follows the slug, so [0] is the leftmost surviving label.
 */
export function distinctiveTokens(slug: string): string[] {
  const base = isConnectGuideSlug(slug) ? slug.slice(0, -CONNECT_GUIDE_SUFFIX.length) : slug;
  const out = new Set<string>();
  for (const token of base.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < MIN_TOKEN_LENGTH || STOPWORDS.has(token)) continue;
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

/**
 * Whether `text` names a multi-label publisher such as `infino-ai`, `pipeworx-io` or `me-qr`.
 *
 * Satisfied two ways, and it needs both:
 *
 *   the full phrase, separator-tolerant  - "infino-ai", "infino ai", "infino.ai"
 *   any one substantial label            - "Pipeworx" for `pipeworx-io`
 *
 * The second exists because corporate suffixes are written in the id and dropped in the prose.
 * 2,597 registry ids (12.2%) end in one - `-io` 1,406, `-org` 325, `-ai` 310, `-dev` 91, `-labs`
 * 63 - and `pipeworx-io` alone is 1,312 servers, the registry's largest publisher. Demanding the
 * full phrase would fail every honest page that simply says "Pipeworx".
 *
 * It does NOT reduce to "any label", which is what makes `me-qr` still safe: both its labels are
 * below MIN_TOKEN_LENGTH, so neither qualifies on its own and only the phrase can satisfy it.
 * That is the difference between naming a publisher and the prose "for me".
 *
 * The separator window is one character, not two: at two, "for me: QR codes" matches `me-qr`,
 * and `io.github.me-qr/mcp-server` is a real server whose guide necessarily discusses QR codes.
 */
export function mentionsOwner(text: string, owner: string): boolean {
  // Labels are [a-z0-9]+ by construction here, so no regex escaping is needed.
  const labels = owner.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (labels.length === 0) return false;
  if (labels.length === 1) return mentionsToken(text, labels[0]);
  if (new RegExp(`(^|[^a-z0-9])${labels.join('[^a-z0-9]{0,1}')}([^a-z0-9]|$)`, 'i').test(text)) {
    return true;
  }
  return labels.some(
    (label) =>
      label.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(label) && mentionsToken(text, label),
  );
}

export interface IdentityFailure {
  field: GradedField;
  /** '' when the field is absent or blank, which is itself a failure for a required field. */
  value: string;
}

export interface IdentityGrade {
  /** False when neither the registry nor the slug yields anything to grade against. The caller
   *  must fail loudly: a check that cannot check must never report a pass. */
  gradeable: boolean;
  tokens: string[];
  owner: string | null;
  /** True when the owner was guessed from the slug because the registry had no entry. */
  ownerIsGuess: boolean;
  failures: IdentityFailure[];
  ownerMentions: number;
  ownerRequired: number;
  /** True when the publisher is named in fewer fields than required. */
  ownerMissing: boolean;
}

/**
 * Grade one connect guide's metadata for its own server's identity.
 *
 * `registryId` is the authoritative source of the publisher; pass null when the slug is absent
 * from the registry snapshot and the leftmost slug label will be used instead, flagged as a guess.
 *
 * `title` is deliberately NOT graded. io-github-infino-ai-mcp-server shipped `"mcp-server Setup"`,
 * which is weak but merged, and grading it would fail a PR for a page the author did not write.
 * The three fields here are the ones all five merged guides agree on.
 */
export function gradeConnectGuideIdentity(
  slug: string,
  guide: Readonly<Record<string, unknown>>,
  registryId: string | null = null,
): IdentityGrade {
  const tokens = distinctiveTokens(slug);
  // Three cases, and conflating the last two is how a guess masquerades as an authority:
  //   registry entry, publisher resolved  -> use it
  //   registry entry, nothing resolvable  -> NO publisher rule (15 ids of 21,290)
  //   no registry entry at all            -> guess from the slug, and say so
  const fromRegistry = registryId ? ownerFromRegistryId(registryId) : null;
  const owner = registryId ? fromRegistry : (tokens[0] ?? null);
  const ownerIsGuess = !registryId && owner !== null;

  // Nothing at all to grade against - neither a resolvable publisher nor a distinctive slug
  // label. Only then is the guide ungradeable, and the caller fails loudly.
  if (owner === null && tokens.length === 0) {
    return {
      gradeable: false,
      tokens,
      owner: null,
      ownerIsGuess: false,
      failures: [],
      ownerMentions: 0,
      ownerRequired: 0,
      ownerMissing: false,
    };
  }

  // The publisher always counts as identifying, even when STOPWORDS would have dropped it.
  const identifying = owner === null || tokens.includes(owner) ? tokens : [owner, ...tokens];

  const failures: IdentityFailure[] = [];
  let ownerMentions = 0;
  let present = 0;
  for (const field of GRADED_FIELDS) {
    const raw = guide[field];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') {
      if ((REQUIRED_FIELDS as readonly string[]).includes(field)) failures.push({ field, value: '' });
      continue;
    }
    present += 1;
    if (owner !== null && mentionsOwner(value, owner)) ownerMentions += 1;
    const named = identifying.some((token) =>
      token === owner ? mentionsOwner(value, token) : mentionsToken(value, token),
    );
    if (!named) failures.push({ field, value });
  }

  // Scale with what the guide actually carries. `outcome` is optional, and a guide without it
  // would otherwise need the publisher in 100% of its fields - stricter than the three-field
  // case, and stricter than nirholas's real merged copy clears.
  // No resolvable publisher (15 ids of 21,290): the per-field rule still applies, but there is
  // no publisher to demand. Disabling one clause beats blocking a PR over a registry id.
  const ownerRequired =
    owner === null ? 0 : Math.min(OWNER_MENTIONS_REQUIRED, Math.max(1, present - 1));
  return {
    gradeable: true,
    tokens,
    owner,
    ownerIsGuess,
    failures,
    ownerMentions,
    ownerRequired,
    ownerMissing: ownerMentions < ownerRequired,
  };
}
