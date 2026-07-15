import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceGuide, citationToServerSlug } from './guides-content';

// The walkthrough extension is additive: a classic flat-body guide must still
// coerce with no walkthrough fields, and a malformed walkthrough field must
// never throw (fail-safe, mirroring the loader's tolerance of bad files).

const CLASSIC = {
  slug: 'classic',
  title: 'Classic guide',
  meta_description: 'desc',
  h1: 'Classic',
  body: 'A flat body.',
  citation_ids: ['mcpindex-snapshot:github-mcp'],
  project: 'mcpindex',
  updated: '2026-07-14',
};

test('classic flat-body guide coerces unchanged, no walkthrough fields leak in', () => {
  const g = coerceGuide(CLASSIC, 'classic');
  assert.ok(g);
  assert.equal(g.body, 'A flat body.');
  assert.equal(g.kind, undefined);
  assert.equal(g.steps, undefined);
  assert.equal(g.next, undefined);
  assert.equal(g.outcome, undefined);
});

test('presence floor: missing title/h1/body -> null', () => {
  assert.equal(coerceGuide({ ...CLASSIC, title: '' }, 'x'), null);
  assert.equal(coerceGuide({ ...CLASSIC, h1: '' }, 'x'), null);
  assert.equal(coerceGuide({ ...CLASSIC, body: '' }, 'x'), null);
  assert.equal(coerceGuide('not an object', 'x'), null);
});

test('walkthrough guide parses steps, embeds, deep links, next, outcome, est_minutes', () => {
  const g = coerceGuide(
    {
      ...CLASSIC,
      slug: 'walk',
      kind: 'walkthrough',
      outcome: 'The gate installed and a HOLD watched.',
      est_minutes: 4,
      impatient: { label: 'See a HOLD first', target_id: 'watch' },
      steps: [
        { id: 'run', heading: 'Run the installer', body: 'Copy and run:', embed: 'install-command' },
        {
          id: 'watch',
          heading: 'Watch a HOLD',
          body: 'Apply a change.',
          embed: 'drift-gate-demo',
          deep_link: { href: '/receipts', label: 'Open receipts', look_for: 'the verdict column' },
          troubleshoot: 'No HOLD? Restart the host.',
        },
      ],
      next: { href: '/guides/evaluate-before-install', label: 'Evaluate a server' },
      depends_on: ['lib/install/commands.ts'],
    },
    'walk',
  );
  assert.ok(g);
  assert.equal(g.kind, 'walkthrough');
  assert.equal(g.estMinutes, 4);
  assert.equal(g.outcome, 'The gate installed and a HOLD watched.');
  assert.deepEqual(g.impatient, { label: 'See a HOLD first', targetId: 'watch' });
  assert.equal(g.steps?.length, 2);
  assert.equal(g.steps?.[0].embed, 'install-command');
  assert.deepEqual(g.steps?.[1].deepLink, {
    href: '/receipts',
    label: 'Open receipts',
    lookFor: 'the verdict column',
  });
  assert.equal(g.steps?.[1].troubleshoot, 'No HOLD? Restart the host.');
  assert.deepEqual(g.next, { href: '/guides/evaluate-before-install', label: 'Evaluate a server' });
  assert.deepEqual(g.dependsOn, ['lib/install/commands.ts']);
});

test('malformed steps are skipped, ids auto-fill to step-N over survivors', () => {
  const g = coerceGuide(
    {
      ...CLASSIC,
      steps: [
        { heading: 'ok', body: 'has both' }, // valid, no id -> step-1
        { heading: 'no body' }, // dropped
        { body: 'no heading' }, // dropped
        'garbage', // dropped
        { heading: 'second', body: 'ok', id: 'Bad Id With Spaces' }, // invalid id -> step-2
      ],
    },
    'x',
  );
  assert.ok(g);
  assert.equal(g.steps?.length, 2);
  assert.equal(g.steps?.[0].id, 'step-1');
  assert.equal(g.steps?.[1].id, 'step-2');
});

test('bad optional sub-objects degrade to undefined, never throw', () => {
  const g = coerceGuide(
    {
      ...CLASSIC,
      est_minutes: -3, // invalid -> undefined
      impatient: { label: 'x' }, // missing target_id -> undefined
      next: { href: '/x' }, // missing label -> undefined
      steps: [{ heading: 'h', body: 'b', deep_link: { href: '/x' } }], // incomplete deep link -> dropped
    },
    'x',
  );
  assert.ok(g);
  assert.equal(g.estMinutes, undefined);
  assert.equal(g.impatient, undefined);
  assert.equal(g.next, undefined);
  assert.equal(g.steps?.[0].deepLink, undefined);
});

test('unsafe hrefs (javascript:, data:) are rejected in deep links and next', () => {
  const g = coerceGuide(
    {
      ...CLASSIC,
      steps: [
        {
          heading: 'h',
          body: 'b',
          deep_link: { href: 'javascript:alert(1)', label: 'x', look_for: 'y' },
        },
      ],
      next: { href: 'data:text/html,evil', label: 'nope' },
    },
    'x',
  );
  assert.ok(g);
  assert.equal(g.steps?.[0].deepLink, undefined, 'javascript: deep link must be dropped');
  assert.equal(g.next, undefined, 'data: next href must be dropped');

  // protocol-relative + backslash forms resolve off-origin -> must be rejected
  for (const bad of ['//evil.com', '/\\evil.com', '/\\/evil.com']) {
    const gg = coerceGuide(
      {
        ...CLASSIC,
        steps: [{ heading: 'h', body: 'b', deep_link: { href: bad, label: 'x', look_for: 'y' } }],
        next: { href: bad, label: 'n' },
      },
      'x',
    );
    assert.equal(gg?.steps?.[0].deepLink, undefined, `deep link ${bad} must be dropped`);
    assert.equal(gg?.next, undefined, `next ${bad} must be dropped`);
  }

  // sanity: safe hrefs (path + https) survive
  const ok = coerceGuide(
    {
      ...CLASSIC,
      steps: [{ heading: 'h', body: 'b', deep_link: { href: '/ledger', label: 'x', look_for: 'y' } }],
      next: { href: 'https://mcpindex.ai/docs', label: 'docs' },
    },
    'x',
  );
  assert.equal(ok?.steps?.[0].deepLink?.href, '/ledger');
  assert.equal(ok?.next?.href, 'https://mcpindex.ai/docs');
});

test('impatient jump is dropped unless target_id matches a surviving step id', () => {
  const miss = coerceGuide(
    { ...CLASSIC, impatient: { label: 'go', target_id: 'nowhere' }, steps: [{ heading: 'h', body: 'b' }] },
    'x',
  );
  assert.equal(miss?.impatient, undefined);

  const hit = coerceGuide(
    { ...CLASSIC, impatient: { label: 'go', target_id: 'watch' }, steps: [{ id: 'watch', heading: 'h', body: 'b' }] },
    'x',
  );
  assert.deepEqual(hit?.impatient, { label: 'go', targetId: 'watch' });
});

test('duplicate author step ids fall back to positional ids (no key/anchor collision)', () => {
  const g = coerceGuide(
    {
      ...CLASSIC,
      steps: [
        { id: 'dup', heading: 'a', body: 'b' },
        { id: 'dup', heading: 'c', body: 'd' },
      ],
    },
    'x',
  );
  assert.equal(g?.steps?.[0].id, 'dup');
  assert.equal(g?.steps?.[1].id, 'step-2'); // second dup -> positional
});

test('author id in the step-N namespace never collides with an auto-filled id', () => {
  const g = coerceGuide(
    {
      ...CLASSIC,
      steps: [
        { id: 'step-2', heading: 'a', body: 'b' }, // author grabs the positional slot of step 2
        { heading: 'c', body: 'd' }, // auto-fill would be step-2 -> must skip to step-3
        { heading: 'e', body: 'f' }, // step-3 taken by... resolve to a free slot
      ],
    },
    'x',
  );
  const ids = g?.steps?.map((s) => s.id) ?? [];
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 3, `ids must be unique, got ${ids.join(',')}`);
  assert.equal(ids[0], 'step-2');
});

test('citationToServerSlug strips namespace, rejects traversal', () => {
  assert.equal(citationToServerSlug('mcpindex-snapshot:github-mcp'), 'github-mcp');
  assert.equal(citationToServerSlug('bare-slug'), 'bare-slug');
  assert.equal(citationToServerSlug('mcpindex-snapshot:../etc'), '');
});
