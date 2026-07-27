// Unit tests for the diagram registry. Run with `npx tsx --conditions=react-server --test lib/diagrams.test.ts`.
//
// The registry is the contract between four artifacts that must not drift: the SVG, the alt,
// the figcaption claim, and the ASCII text twin. scripts/check-diagram-freshness.mjs enforces
// the cross-file rules (placement liveness, tripwires, contrast, hardcoded facts) at build
// time; these tests cover the ones that are checkable in-process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAGRAMS,
  POSTURE_ROWS,
  getDiagram,
  renderTwin,
  attributionHtml,
} from './diagrams';
import { SURFACE_CHANGE_KINDS, SAFETY_RELEVANT_CHANGE_KINDS } from './changeKinds';

test('every figure carries the four artifacts that make it legible to a model', () => {
  for (const d of DIAGRAMS) {
    assert.match(d.id, /^[a-z0-9-]+$/, `${d.id}: id must be a URL-safe slug`);
    assert.ok(d.fig.trim(), `${d.id}: needs a figure number`);
    assert.ok(d.claim.trim(), `${d.id}: needs a claim (it becomes the figcaption)`);
    assert.ok(d.alt.trim(), `${d.id}: needs an alt`);
    assert.ok(d.twin.trim(), `${d.id}: needs a text twin - that is what an answer engine quotes`);
    // A lazy alt that repeats the claim gives a screen reader the headline and nothing else.
    assert.notEqual(d.alt.trim(), d.claim.trim(), `${d.id}: alt must describe, not repeat the claim`);
    assert.ok(d.alt.length > d.claim.length, `${d.id}: alt should say more than the claim`);
  }
});

test('ids are unique and each figure owns its permalink', () => {
  const seen = new Set<string>();
  for (const d of DIAGRAMS) {
    assert.ok(!seen.has(d.id), `duplicate diagram id: ${d.id}`);
    seen.add(d.id);
    assert.ok(
      d.placements.includes(`/diagrams/${d.id}`),
      `${d.id}: must list its own permalink so the gallery and the page agree`,
    );
    assert.ok(
      d.placements.some((p) => !p.startsWith('/diagrams')),
      `${d.id}: is placed nowhere on the site - an orphan in the sitemap`,
    );
  }
});

test('figure numbers are unique (a duplicate "Fig. 03" reads as an error)', () => {
  const figs = DIAGRAMS.map((d) => d.fig);
  assert.equal(new Set(figs).size, figs.length, `duplicate figure numbers: ${figs.join(',')}`);
});

test('the posture matrix is GENERATED from the taxonomy, not typed', () => {
  // One row per surfaced kind. If the taxonomy grows, the figure grows with it.
  assert.equal(POSTURE_ROWS.length, SURFACE_CHANGE_KINDS.size);
  for (const r of POSTURE_ROWS) {
    assert.ok(SURFACE_CHANGE_KINDS.has(r.kind), `${r.kind}: not a surfaced kind`);
    // The cardinal rule of the figure: guard tracks the safety bit, nothing else.
    assert.equal(r.safety, SAFETY_RELEVANT_CHANGE_KINDS.has(r.kind), `${r.kind}: safety bit mismatch`);
    assert.equal(r.guard, r.safety ? 'HOLD' : 'proceed', `${r.kind}: guard cell disagrees with the safety bit`);
    assert.equal(r.monitor, 'notify');
    assert.equal(r.strict, 'HOLD', `${r.kind}: strict holds on any drift, by definition`);
    assert.ok(r.label.trim(), `${r.kind}: needs a human label`);
  }
});

test('safety-relevant rows sort first, so the figure reads breaking-first', () => {
  const flags = POSTURE_ROWS.map((r) => r.safety);
  const firstFalse = flags.indexOf(false);
  if (firstFalse !== -1) {
    assert.ok(
      !flags.slice(firstFalse).includes(true),
      'safety-relevant kinds must be contiguous at the top',
    );
  }
});

test('the posture twin quotes the same counts the rows produce', () => {
  const d = getDiagram('posture-matrix');
  assert.ok(d);
  const safety = POSTURE_ROWS.filter((r) => r.safety).length;
  assert.ok(
    d!.twin.includes(`${safety} of ${POSTURE_ROWS.length} surfaced kinds`),
    'the generated twin must quote the generated counts',
  );
  // An injection marker is a separate scan, not a ChangeKind. The twin says so explicitly
  // because an earlier hand-drawn draft of this matrix listed it as a row.
  assert.ok(d!.twin.includes('not a ChangeKind'));
});

test('renderTwin interpolates tokens and leaves unknown ones visible', () => {
  assert.equal(renderTwin('a {servers} b', { servers: '42' }), 'a 42 b');
  assert.equal(renderTwin('{nope}'), '{nope}');
  // d3progress is always available: the verdict figure quotes it.
  assert.match(renderTwin('{d3progress}'), /^\d+\/\d+$/);
});

test('no twin ships an uninterpolated token', () => {
  for (const d of DIAGRAMS) {
    const rendered = renderTwin(d.twin, { servers: '0', categories: '0' });
    const leftover = rendered.match(/\{[a-z][a-zA-Z]*\}/);
    assert.equal(leftover, null, `${d.id}: twin has an unfilled token ${leftover?.[0]}`);
  }
});

test('a figure that renders a changing number declares where it comes from', () => {
  for (const d of DIAGRAMS) {
    // Thousands separators and percentages are fact shapes, not prose.
    const factish = /\b\d{1,3},\d{3}\b|\b\d+(?:\.\d+)?%/.test(`${d.claim} ${d.alt} ${d.twin}`);
    if (factish) {
      assert.ok(
        d.derives.length > 0,
        `${d.id}: quotes a figure but declares no source in \`derives\` - that is how a diagram goes stale`,
      );
    }
  }
});

test('getDiagram resolves and misses safely', () => {
  assert.equal(getDiagram('where-the-gate-sits')?.fig, '01');
  assert.equal(getDiagram('not-a-diagram'), undefined);
});

test('the attribution line carries the permalink and the licence', () => {
  const d = DIAGRAMS[0];
  const html = attributionHtml(d);
  assert.ok(html.includes(`/diagrams/${d.id}`));
  assert.ok(html.includes('CC BY 4.0'));
});

test('no figure asserts a safety verdict', () => {
  // The cardinal rule. A box label has no room for a caveat, so the check is blunt.
  const banned = [/\bis safe\b/i, /\bguarantee/i, /\bblocks? attacks?\b/i, /\bcertified\b/i];
  for (const d of DIAGRAMS) {
    const text = `${d.claim} ${d.alt}`;
    for (const re of banned) {
      const m = text.match(re);
      if (!m) continue;
      const before = text.slice(Math.max(0, m.index! - 40), m.index!).toLowerCase();
      assert.ok(
        /\b(never|not|no|cannot|without)\b[^.]*$/.test(before),
        `${d.id}: asserts "${m[0]}" - the gate reports a contract-diff, never a safety verdict`,
      );
    }
  }
});
