import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distinctiveTokens,
  gradeConnectGuideIdentity,
  isConnectGuideSlug,
  mentionsOwner,
  mentionsToken,
  ownerFromRegistryId,
} from './guideSeo';

// The rule these cases pin down: a generated connect guide must name its own server in the
// metadata that decides what it ranks for. The corpus below is the real one merged in PR #92 -
// four guides that got it right and the one that did not - so a future edit that would have let
// the 1lystore page through fails here rather than in a review nobody repeats.

const GOOD_SIBLINGS = [
  {
    slug: 'io-github-cyanheads-eurostat-mcp-server-with-claude-code',
    registryId: 'io.github.cyanheads/eurostat-mcp-server',
    h1: 'io.github.cyanheads/eurostat-mcp-server Setup',
    meta_description: 'Connect io.github.cyanheads/eurostat-mcp-server to Claude Code',
    outcome:
      'At the end of this process, you will have the io.github.cyanheads/eurostat-mcp-server working with your MCP client.',
  },
  {
    slug: 'io-github-infino-ai-mcp-server-with-claude-code',
    registryId: 'io.github.infino-ai/mcp-server',
    h1: 'Connecting io.github.infino-ai/mcp-server to Claude Code',
    meta_description: 'Connect to io.github.infino-ai/mcp-server',
    outcome:
      'The reader will have the io.github.infino-ai/mcp-server connected to their MCP client at the end of this guide.',
  },
  {
    slug: 'io-github-nirholas-portfolio-mcp-with-claude-code',
    registryId: 'io.github.nirholas/portfolio-mcp',
    h1: 'Connecting io.github.nirholas/portfolio-mcp to Claude Code',
    meta_description: 'Setup three.ws Portfolio MCP',
    outcome:
      'You will have the io.github.nirholas/portfolio-mcp server working with Claude Code at the end of this guide.',
  },
  {
    slug: 'io-github-obscuritysrl-umbriel-with-claude-code',
    registryId: 'io.github.ObscuritySRL/umbriel',
    h1: 'Connecting io.github.ObscuritySRL/umbriel to Claude Code',
    meta_description: 'Connect io.github.ObscuritySRL/umbriel to Claude Code',
    outcome:
      'You will have io.github.ObscuritySRL/umbriel connected to Claude Code and accessible through the client tools.',
  },
];

for (const sibling of GOOD_SIBLINGS) {
  test(`merged guide passes: ${sibling.slug}`, () => {
    const grade = gradeConnectGuideIdentity(sibling.slug, sibling, sibling.registryId);
    assert.equal(grade.gradeable, true);
    assert.deepEqual(grade.failures, [], `unexpected failures: ${JSON.stringify(grade.failures)}`);
  });
}

test('the shipped 1lystore page fails on every graded field', () => {
  const grade = gradeConnectGuideIdentity(
    'io-github-1lystore-mcp-server-with-claude-code',
    {
      h1: 'Connect to MCP Server',
      title: 'MCP Server Setup',
      meta_description: 'Connect to MCP server',
      outcome: 'You will have the MCP server connected to Claude Code at the end of this process.',
    },
    'io.github.1lystore/mcp-server',
  );
  assert.equal(grade.gradeable, true);
  assert.deepEqual(grade.tokens, ['1lystore']);
  assert.deepEqual(
    grade.failures.map((f) => f.field).sort(),
    ['h1', 'meta_description', 'outcome'],
  );
});

test('the corrected 1lystore page passes', () => {
  const grade = gradeConnectGuideIdentity(
    'io-github-1lystore-mcp-server-with-claude-code',
    {
      h1: 'Connecting io.github.1lystore/mcp-server to Claude Code',
      meta_description: 'Connect io.github.1lystore/mcp-server to Claude Code',
      outcome:
        'You will have io.github.1lystore/mcp-server connected to Claude Code, with the 1ly.store buy/sell and token-launch tools callable from the client.',
    },
    'io.github.1lystore/mcp-server',
  );
  assert.deepEqual(grade.failures, []);
});

// --- the generic-word hole -----------------------------------------------------------------

test('the publisher comes from the registry id, not from slug position', () => {
  // Reverse-DNS: only io.github.* puts the publisher third. Measured over data/slugmap.json,
  // 4,219 of 21,290 ids would resolve to the namespace prefix under a positional guess.
  assert.equal(ownerFromRegistryId('io.github.1lystore/mcp-server'), '1lystore');
  assert.equal(ownerFromRegistryId('com.getsentry/mcp'), 'getsentry');
  assert.equal(ownerFromRegistryId('io.github.me-qr/mcp-server'), 'me-qr');
  assert.equal(ownerFromRegistryId('io.github.github/github-mcp-server'), 'github');
});

test('a com.* guide must name the publisher, not the namespace prefix', () => {
  // Under the positional rule this passed on the bare word "com" - the 1lystore defect, for
  // 2,765 servers. `com` is now a stopword AND the publisher is read from the id.
  const generic = gradeConnectGuideIdentity(
    'com-getsentry-mcp-with-claude-code',
    {
      h1: 'Connect to the MCP server',
      meta_description: 'Connect to the MCP server at example.com',
      outcome: 'You will have the MCP server connected.',
    },
    'com.getsentry/mcp',
  );
  assert.equal(generic.owner, 'getsentry');
  assert.equal(generic.ownerMissing, true);

  const named = gradeConnectGuideIdentity(
    'com-getsentry-mcp-with-claude-code',
    {
      h1: 'Connecting com.getsentry/mcp to Claude Code',
      meta_description: 'Connect com.getsentry/mcp to Claude Code',
      outcome: 'You will have getsentry connected.',
    },
    'com.getsentry/mcp',
  );
  assert.deepEqual(named.failures, []);
  assert.equal(named.ownerMissing, false);
});

test('a publisher literally named "github" stays gradeable', () => {
  // io.github.github/github-mcp-server is a real id and the only one of 21,290 that a
  // stopword-filtered rule cannot grade at all. It must not hard-block a PR.
  const grade = gradeConnectGuideIdentity(
    'io-github-github-github-mcp-server-with-claude-code',
    {
      h1: 'Connecting io.github.github/github-mcp-server to Claude Code',
      meta_description: 'Connect io.github.github/github-mcp-server to Claude Code',
      outcome: 'You will have io.github.github/github-mcp-server connected.',
    },
    'io.github.github/github-mcp-server',
  );
  assert.equal(grade.gradeable, true);
  assert.equal(grade.owner, 'github');
  assert.deepEqual(grade.failures, []);
  assert.equal(grade.ownerMissing, false);
});

test('a two-label publisher is matched as a phrase, so prose cannot satisfy it', () => {
  // `me-qr` split into tokens would be satisfied by "for me", which is prose, not a name.
  assert.equal(mentionsOwner('The MCP server will be connected for me.', 'me-qr'), false);
  assert.ok(mentionsOwner('io.github.me-qr/mcp-server', 'me-qr'));
  assert.ok(mentionsOwner('Connect me qr today', 'me-qr'));
  assert.ok(mentionsOwner('io.github.infino-ai/mcp-server', 'infino-ai'));
  assert.equal(mentionsOwner('an AI-powered server', 'infino-ai'), false);
});

test('meta_description alone cannot be boilerplate (owner needed in 2 of 3)', () => {
  // One mention was too weak: it left the search-result snippet free to say nothing.
  const grade = gradeConnectGuideIdentity(
    'io-github-cyanheads-eurostat-mcp-server-with-claude-code',
    {
      h1: 'Connecting io.github.cyanheads/eurostat-mcp-server to Claude Code',
      meta_description: 'Connect to the eurostat MCP server',
      outcome: 'You will have the eurostat MCP server connected.',
    },
    'io.github.cyanheads/eurostat-mcp-server',
  );
  assert.deepEqual(grade.failures, [], 'each field names the product, so the per-field rule holds');
  assert.equal(grade.ownerMentions, 1);
  assert.equal(grade.ownerRequired, 2);
  assert.equal(grade.ownerMissing, true);
});

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

test('2-of-3 is what the weakest merged guide actually clears', () => {
  // nirholas's real meta_description is "Setup three.ws Portfolio MCP" - it names the product,
  // not the org - so this page sits exactly on the threshold at 2/3. Requiring 3 would fail
  // perfectly good merged copy; requiring 1 would let the snippet say nothing. This test is the
  // reason the constant is 2, so it must use the REAL field values.
  const grade = gradeConnectGuideIdentity(
    'io-github-nirholas-portfolio-mcp-with-claude-code',
    {
      h1: 'Connecting io.github.nirholas/portfolio-mcp to Claude Code',
      meta_description: 'Setup three.ws Portfolio MCP',
      outcome:
        'You will have the io.github.nirholas/portfolio-mcp server working with Claude Code at the end of this guide.',
    },
    'io.github.nirholas/portfolio-mcp',
  );
  assert.deepEqual(grade.failures, []);
  assert.equal(grade.ownerMentions, 2);
  assert.equal(grade.ownerMissing, false);
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

test('a short-named publisher is rescued by the registry, not hard-blocked', () => {
  // The slug alone yields nothing here: `x` is under the length floor and `ai` is a stopword.
  // A positional rule would call this ungradeable and make the PR unmergeable over a registry
  // id the merging author cannot change. The id states the publisher outright.
  assert.deepEqual(distinctiveTokens('io-github-x-ai-with-claude-code'), []);
  const grade = gradeConnectGuideIdentity(
    'io-github-x-ai-with-claude-code',
    {
      h1: 'Connecting io.github.x-ai/mcp-server to Claude Code',
      meta_description: 'Connect io.github.x-ai/mcp-server to Claude Code',
    },
    'io.github.x-ai/mcp-server',
  );
  assert.equal(grade.gradeable, true);
  assert.equal(grade.owner, 'x-ai');
  assert.deepEqual(grade.failures, []);
  assert.equal(grade.ownerMissing, false);
});

test('with no registry entry the publisher is guessed and flagged as a guess', () => {
  const grade = gradeConnectGuideIdentity('io-github-newpublisher-thing-with-claude-code', {
    h1: 'Connecting io.github.newpublisher/thing to Claude Code',
    meta_description: 'Connect io.github.newpublisher/thing to Claude Code',
  });
  assert.equal(grade.owner, 'newpublisher');
  assert.equal(grade.ownerIsGuess, true);
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
