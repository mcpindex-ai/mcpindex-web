import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distinctiveTokens,
  gradeConnectGuideIdentity,
  isConnectGuideSlug,
  mentionsToken,
  ownerToken,
} from './guideSeo';

// The rule these cases pin down: a generated connect guide must name its own server in the
// metadata that decides what it ranks for. The corpus below is the real one merged in PR #92 -
// four guides that got it right and the one that did not - so a future edit that would have let
// the 1lystore page through fails here rather than in a review nobody repeats.

const GOOD_SIBLINGS = [
  {
    slug: 'io-github-cyanheads-eurostat-mcp-server-with-claude-code',
    h1: 'io.github.cyanheads/eurostat-mcp-server Setup',
    meta_description: 'Connect io.github.cyanheads/eurostat-mcp-server to Claude Code',
    outcome:
      'At the end of this process, you will have the io.github.cyanheads/eurostat-mcp-server working with your MCP client.',
  },
  {
    slug: 'io-github-infino-ai-mcp-server-with-claude-code',
    h1: 'Connecting io.github.infino-ai/mcp-server to Claude Code',
    meta_description: 'Connect to io.github.infino-ai/mcp-server',
    outcome:
      'The reader will have the io.github.infino-ai/mcp-server connected to their MCP client at the end of this guide.',
  },
  {
    slug: 'io-github-nirholas-portfolio-mcp-with-claude-code',
    h1: 'Connecting io.github.nirholas/portfolio-mcp to Claude Code',
    meta_description: 'Setup three.ws Portfolio MCP',
    outcome:
      'You will have the io.github.nirholas/portfolio-mcp server working with Claude Code at the end of this guide.',
  },
  {
    slug: 'io-github-obscuritysrl-umbriel-with-claude-code',
    h1: 'Connecting io.github.ObscuritySRL/umbriel to Claude Code',
    meta_description: 'Connect io.github.ObscuritySRL/umbriel to Claude Code',
    outcome:
      'You will have io.github.ObscuritySRL/umbriel connected to Claude Code and accessible through the client tools.',
  },
];

for (const sibling of GOOD_SIBLINGS) {
  test(`merged guide passes: ${sibling.slug}`, () => {
    const grade = gradeConnectGuideIdentity(sibling.slug, sibling);
    assert.equal(grade.gradeable, true);
    assert.deepEqual(grade.failures, [], `unexpected failures: ${JSON.stringify(grade.failures)}`);
  });
}

test('the shipped 1lystore page fails on every graded field', () => {
  const grade = gradeConnectGuideIdentity('io-github-1lystore-mcp-server-with-claude-code', {
    h1: 'Connect to MCP Server',
    title: 'MCP Server Setup',
    meta_description: 'Connect to MCP server',
    outcome: 'You will have the MCP server connected to Claude Code at the end of this process.',
  });
  assert.equal(grade.gradeable, true);
  assert.deepEqual(grade.tokens, ['1lystore']);
  assert.deepEqual(
    grade.failures.map((f) => f.field).sort(),
    ['h1', 'meta_description', 'outcome'],
  );
});

test('the corrected 1lystore page passes', () => {
  const grade = gradeConnectGuideIdentity('io-github-1lystore-mcp-server-with-claude-code', {
    h1: 'Connecting io.github.1lystore/mcp-server to Claude Code',
    meta_description: 'Connect io.github.1lystore/mcp-server to Claude Code',
    outcome:
      'You will have io.github.1lystore/mcp-server connected to Claude Code, with the 1ly.store buy/sell and token-launch tools callable from the client.',
  });
  assert.deepEqual(grade.failures, []);
});

// --- the generic-word hole -----------------------------------------------------------------

test('a page that names only the generic half of the slug fails', () => {
  // The defect this closes: with a per-field-any-token rule, this passes for
  // io-github-nirholas-portfolio-mcp while never saying whose server it is - metadata about no
  // particular server, which is exactly the 1lystore defect. That page was caught only because
  // "1lystore" happens to be meaningless in English. Luck is not a rule.
  const grade = gradeConnectGuideIdentity('io-github-nirholas-portfolio-mcp-with-claude-code', {
    h1: 'Connect to the portfolio MCP server',
    meta_description: 'Connect to the portfolio MCP server',
    outcome: 'You will have the portfolio MCP server connected.',
  });
  assert.deepEqual(grade.failures, [], 'each field does name something from the slug');
  assert.equal(grade.owner, 'nirholas');
  assert.equal(grade.ownerMissing, true, 'but none of them names the publisher');
});

test('naming the publisher once is enough (merged sibling relies on this)', () => {
  // nirholas's real meta_description is "Setup three.ws Portfolio MCP" - it names the product,
  // not the org. The collective rule must not fail that page on the strength of its h1.
  const grade = gradeConnectGuideIdentity('io-github-nirholas-portfolio-mcp-with-claude-code', {
    h1: 'Connecting io.github.nirholas/portfolio-mcp to Claude Code',
    meta_description: 'Setup three.ws Portfolio MCP',
    outcome: 'You will have the portfolio server working with Claude Code.',
  });
  assert.deepEqual(grade.failures, []);
  assert.equal(grade.ownerMissing, false);
});

test('ownerToken is the org segment, not the product segment', () => {
  assert.equal(ownerToken('io-github-nirholas-portfolio-mcp-with-claude-code'), 'nirholas');
  assert.equal(ownerToken('io-github-cyanheads-eurostat-mcp-server-with-claude-code'), 'cyanheads');
  assert.equal(ownerToken('io-github-1lystore-mcp-server-with-claude-code'), '1lystore');
  assert.equal(ownerToken('io-github-mcp-server-with-claude-code'), null);
});

// --- the traps ---------------------------------------------------------------------------

test('a two-char slug segment is not an identity ("AI" is prose, not a name)', () => {
  // infino-ai yields only `infino`. The matcher is boundary-anchored, so the risk `ai` poses is
  // NOT the letters inside "available"/"explain" - it is a standalone "AI" in ordinary copy,
  // which any generator emits for any server. This asserts at MIN=3 by construction.
  assert.deepEqual(distinctiveTokens('io-github-infino-ai-mcp-server-with-claude-code'), ['infino']);
  const grade = gradeConnectGuideIdentity('io-github-infino-ai-mcp-server-with-claude-code', {
    h1: 'Connect to an AI-powered MCP server',
    meta_description: 'An AI server for your client',
    outcome: 'You will have an AI MCP server connected.',
  });
  // Would be 0 failures if `ai` were a token; the copy names nothing else from the slug.
  assert.equal(grade.failures.length, 3);
});

test('a slug with no full-length token falls back rather than hard-blocking the PR', () => {
  // The slug comes from the registry id, so a legitimately short-named server is not the
  // merging author's mistake to fix. Grade it weakly; do not make the PR unmergeable.
  assert.deepEqual(distinctiveTokens('io-github-x-ai-with-claude-code'), ['ai']);
  const grade = gradeConnectGuideIdentity('io-github-x-ai-with-claude-code', {
    h1: 'Connecting x-ai to Claude Code',
    meta_description: 'Connect x-ai to Claude Code',
  });
  assert.equal(grade.gradeable, true);
  assert.deepEqual(grade.failures, []);
});

test('token match reads through punctuation but not through word interiors', () => {
  assert.ok(mentionsToken('io.github.1lystore/mcp-server', '1lystore'));
  assert.ok(mentionsToken('Connect ObscuritySRL/umbriel now', 'umbriel'));
  assert.ok(mentionsToken('umbriel', 'umbriel'));
  assert.equal(mentionsToken('mainframe migration', 'main'), false);
  assert.equal(mentionsToken('portfolios are plural', 'portfolio'), false);
});

test('matching is case-insensitive (slug is lowercase, prose is not)', () => {
  assert.ok(mentionsToken('io.github.ObscuritySRL/umbriel', 'obscuritysrl'));
});

test('the boundary class stays case-insensitive too, not just the token', () => {
  // Subtle: under /i, [^a-z0-9] must NOT match an uppercase letter, or every token would match
  // inside SHOUTED prose. Rewriting the class to \W or adding the u flag would break this while
  // every other test stayed green.
  assert.equal(mentionsToken('MAINFRAME migration', 'main'), false);
  assert.equal(mentionsToken('REMAINDER', 'main'), false);
  assert.equal(mentionsToken('UMBRIELX', 'umbriel'), false);
});

test('a slug with no gradeable token reports ungradeable, never a silent pass', () => {
  // Every segment is a stopword: nothing distinctive survives, so the caller must fail loudly
  // rather than record a guide that passed because there was nothing to ask of it.
  const grade = gradeConnectGuideIdentity('io-github-mcp-server-with-claude-code', {
    h1: 'Connect to MCP Server',
    meta_description: 'Connect to MCP server',
  });
  assert.equal(grade.gradeable, false);
  assert.deepEqual(grade.failures, []);
});

test('a required field that is missing or blank fails; a missing optional field does not', () => {
  const grade = gradeConnectGuideIdentity('io-github-obscuritysrl-umbriel-with-claude-code', {
    h1: '   ',
    meta_description: 'Connect io.github.ObscuritySRL/umbriel to Claude Code',
    // `outcome` absent entirely - a classic guide shape, not an identity defect
  });
  assert.deepEqual(
    grade.failures.map((f) => f.field),
    ['h1'],
  );
});

test('title is not graded, so infino\'s weak but merged title cannot fail a PR', () => {
  const grade = gradeConnectGuideIdentity('io-github-infino-ai-mcp-server-with-claude-code', {
    h1: 'Connecting io.github.infino-ai/mcp-server to Claude Code',
    meta_description: 'Connect to io.github.infino-ai/mcp-server',
    outcome: 'You will have io.github.infino-ai/mcp-server connected.',
    title: 'mcp-server Setup',
  });
  assert.deepEqual(grade.failures, []);
});

// --- scoping -----------------------------------------------------------------------------

test('only the generated connect-guide family is in scope', () => {
  assert.ok(isConnectGuideSlug('io-github-obscuritysrl-umbriel-with-claude-code'));
  // The 19 topical guides carry no server identity in the slug and must never be graded.
  assert.equal(isConnectGuideSlug('how-to-trust-an-mcp-server'), false);
  assert.equal(isConnectGuideSlug('mcp-scanner-vs-gateway'), false);
  assert.equal(isConnectGuideSlug('why-your-mcp-scan-has-no-green-checkmarks'), false);
  // Degenerate: the suffix alone is not a server guide.
  assert.equal(isConnectGuideSlug('-with-claude-code'), false);
});
