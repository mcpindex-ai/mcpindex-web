import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildServerMetaDescription,
  expandServerBlurb,
  SERVER_META_MAX,
  SERVER_META_MIN,
  SERVER_META_SUFFIXES,
} from './serverMetaDescription';

/** Substrings that would invent a per-server verdict or outcome. */
const FORBIDDEN = [
  'screened',
  'verified safe',
  'passed',
  'trusted',
  'ALLOW',
  ' quality score: ',
  'score of ',
  'safe to use',
  'malicious',
];

const CSV_FIXTURES = [
  {
    slug: 'io-github-onikora-fix-parser',
    description: 'Parse FIX messages and help agents create Fixie initiators.',
    name: 'io.github.onikora/fix-parser',
    title: 'Fixie MCP Server',
  },
  {
    slug: 'direct-openclaw-mcp',
    description: 'Deploy, monitor, and manage your OpenClaw AI assistants via natural language.',
    name: 'direct.openclaw/mcp',
    title: 'OpenClaw Direct',
  },
  {
    slug: 'ai-dragoneye-mcp',
    description:
      'Build zero-shot video models for object detection, and category and attribute classification.',
    name: 'ai.dragoneye/mcp',
    title: 'ai.dragoneye/mcp',
  },
  {
    slug: 'ai-butlerbrain-mcp',
    description:
      'Persistent memory for AI assistants. Save once; recall from Claude, ChatGPT, or any MCP client.',
    name: 'ai.butlerbrain/mcp',
    title: 'ai.butlerbrain/mcp',
  },
  {
    slug: 'ai-publishwith-mcp',
    description:
      'Publish AI reports as managed native links with versions, access control, revocation, and audit.',
    name: 'ai.publishwith/mcp',
    title: 'publishwith.ai',
  },
] as const;

function assertHonest(meta: string, registryBlurb: string) {
  assert.ok(meta.length <= SERVER_META_MAX, `over ceiling (${meta.length}): ${meta}`);
  for (const bad of FORBIDDEN) {
    if (registryBlurb.toLowerCase().includes(bad.toLowerCase())) continue;
    assert.ok(
      !meta.toLowerCase().includes(bad.toLowerCase()),
      `forbidden "${bad}" in: ${meta}`,
    );
  }
}

test('buildServerMetaDescription: CSV fixtures hit length band and stay differentiated', () => {
  for (const fix of CSV_FIXTURES) {
    const meta = buildServerMetaDescription(fix);
    assertHonest(meta, fix.description);
    assert.ok(
      meta.length >= SERVER_META_MIN,
      `${fix.slug} under soft target (${meta.length}): ${meta}`,
    );
    assert.notEqual(meta, fix.description, `${fix.slug} must not be bare registry blurb`);
    assert.match(meta, /mcpindex/i, `${fix.slug} must name mcpindex for AEO`);
    assert.ok(
      /description-screen status|Quality Score|Indexed on mcpindex/i.test(meta),
      `${fix.slug} missing mcpindex differentiator: ${meta}`,
    );
    // Reachability is only publishable for negative liveness — must not appear here.
    assert.ok(
      !/reachability/i.test(meta),
      `${fix.slug} claimed reachability without liveness row: ${meta}`,
    );
  }
});

test('buildServerMetaDescription: liveness lead preserved; blurb not mangled to chase 150', () => {
  const fix = CSV_FIXTURES[0];
  const meta = buildServerMetaDescription({
    ...fix,
    livenessHttpStatus: 404,
  });
  assertHonest(meta, fix.description);
  assert.match(meta, /^Source repo returns HTTP 404/);
  assert.match(meta, /may be private or moved/);
  assert.ok(
    meta.includes('Fixie initiators') || meta.includes('Parse FIX messages'),
    `liveness meta mangled blurb: ${meta}`,
  );
  assert.ok(!/screened|safe|passed/i.test(meta));
});

test('buildServerMetaDescription: liveness base just under 150 is not mangled for a pad', () => {
  // lead (56) + blurb (93) = 149 — must return intact, not clip to append "Indexed…"
  const blurb =
    'Build zero-shot video models for object detection, and category and attribute classification.';
  const meta = buildServerMetaDescription({
    description: blurb,
    name: 'ai.dragoneye/mcp',
    title: 'ai.dragoneye/mcp',
    livenessHttpStatus: 404,
  });
  assert.match(meta, /classification\.?$/);
  assert.ok(!meta.includes('Indexed on'), `should not mangle 149-char liveness base: ${meta}`);
  assert.ok(meta.length <= SERVER_META_MAX);
});

test('buildServerMetaDescription: garbage blurb expands with title, still honest', () => {
  const meta = buildServerMetaDescription({
    description: 'Ok',
    name: 'live.example/ok',
    title: 'My MCP Server',
  });
  assertHonest(meta, 'Ok');
  assert.match(meta, /My MCP Server/);
  assert.match(meta, /mcpindex/i);
  assert.ok(!/reachability/i.test(meta));
  assert.ok(meta.length <= SERVER_META_MAX);
});

test('buildServerMetaDescription: never emits bare registry blurb without liveness', () => {
  const meta = buildServerMetaDescription({
    description: 'A perfectly normal registry blurb about tools for agents.',
    name: 'io.github.example/tools',
    title: 'Example Tools',
  });
  assert.notEqual(meta, 'A perfectly normal registry blurb about tools for agents.');
  assert.match(meta, /mcpindex(?:\.ai)? listing/i);
});

test('expandServerBlurb: leaves long blurbs alone when suffix can hit 150', () => {
  const long =
    'Deploy, monitor, and manage your OpenClaw AI assistants via natural language.';
  assert.equal(expandServerBlurb(long, 'direct.openclaw/mcp', 'OpenClaw Direct'), long);
});

test('SERVER_META_SUFFIXES: AEO entity marker, no verdict verbs, no reachability', () => {
  const joined = SERVER_META_SUFFIXES.join(' ');
  assert.match(joined, /mcpindex/i);
  assert.match(joined, /listing/i);
  assert.match(joined, /agents/i);
  for (const bad of ['screened', 'safe', 'passed', 'verified', 'ALLOW', 'PASS', 'reachability']) {
    assert.ok(!joined.includes(bad), `suffix ladder contains banned word "${bad}"`);
  }
});
