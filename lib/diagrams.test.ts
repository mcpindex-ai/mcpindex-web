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
import {
  SURFACE_CHANGE_KINDS,
  SAFETY_RELEVANT_CHANGE_KINDS,
  BENIGN_AUTOACCEPT_CHANGE_KINDS,
  BEHAVIORAL_MANDATED_CHANGE_KINDS,
} from './changeKinds';

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

test('the posture matrix is GENERATED from the gate sets, not typed', () => {
  // One row per surfaced kind. If the taxonomy grows, the figure grows with it.
  assert.equal(POSTURE_ROWS.length, SURFACE_CHANGE_KINDS.size);
  for (const r of POSTURE_ROWS) {
    assert.ok(SURFACE_CHANGE_KINDS.has(r.kind), `${r.kind}: not a surfaced kind`);
    assert.equal(r.safety, SAFETY_RELEVANT_CHANGE_KINDS.has(r.kind), `${r.kind}: safety bit mismatch`);
    assert.ok(r.label.trim(), `${r.kind}: needs a human label`);
    assert.ok(r.because.trim(), `${r.kind}: needs a reason`);
  }
});

// The three rules below are the OBSERVED behaviour of corpus_eval/tooling/cse/gate.py, captured
// 2026-07-27 by driving the real Gate at each posture. They are the contract this figure draws;
// if the gate changes, these fail and the figure must be redrawn.
test('MONITOR never blocks - every kind proceeds', () => {
  for (const r of POSTURE_ROWS) {
    assert.ok(
      r.monitor === 'PROCEED' || r.monitor === 'PROCEED_NOTIFY',
      `${r.kind}: monitor must never block, got ${r.monitor}`,
    );
  }
});

test('a proven-benign drift proceeds under EVERY posture, strict included', () => {
  // The correction that mattered: auto-accept runs BEFORE apply_posture, so "strict holds any
  // drift" is false. An earlier draft of this figure asserted exactly that.
  const benign = POSTURE_ROWS.filter((r) => BENIGN_AUTOACCEPT_CHANGE_KINDS.has(r.kind));
  assert.ok(benign.length > 0, 'expected at least one surfaced benign kind');
  for (const r of benign) {
    assert.equal(r.guard, 'PROCEED', `${r.kind}: guard must auto-accept a proven-benign drift`);
    assert.equal(r.strict, 'PROCEED', `${r.kind}: STRICT must proceed on a proven-benign drift`);
  }
});

test('behaviour-mandated kinds resolve to INCONCLUSIVE, never a flat HOLD', () => {
  for (const r of POSTURE_ROWS) {
    if (!BEHAVIORAL_MANDATED_CHANGE_KINDS.has(r.kind)) continue;
    assert.equal(r.guard, 'INCONCLUSIVE', `${r.kind}: behaviour is the gate, not a block`);
    assert.equal(r.strict, 'INCONCLUSIVE', `${r.kind}: strict keeps the inconclusive state`);
  }
});

test('every other safety-relevant kind HOLDs under guard and strict', () => {
  for (const r of POSTURE_ROWS) {
    if (BENIGN_AUTOACCEPT_CHANGE_KINDS.has(r.kind)) continue;
    if (BEHAVIORAL_MANDATED_CHANGE_KINDS.has(r.kind)) continue;
    assert.equal(r.guard, 'HOLD', `${r.kind}: carries the safety bit, guard must hold`);
    assert.equal(r.strict, 'HOLD', `${r.kind}: strict must hold what it cannot prove benign`);
  }
});

test('rows sort blocking first, benign last, so the figure reads by severity', () => {
  const rank = (r: (typeof POSTURE_ROWS)[number]) =>
    BENIGN_AUTOACCEPT_CHANGE_KINDS.has(r.kind) ? 2 : BEHAVIORAL_MANDATED_CHANGE_KINDS.has(r.kind) ? 1 : 0;
  const ranks = POSTURE_ROWS.map(rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'rows must be grouped by severity');
});

test('the posture twin quotes the same counts the rows produce', () => {
  const d = getDiagram('posture-matrix');
  assert.ok(d);
  const holds = POSTURE_ROWS.filter((r) => r.guard === 'HOLD').length;
  assert.ok(
    d!.twin.includes(`${holds} HOLD under guard`),
    'the generated twin must quote the generated counts',
  );
  // The correction must survive in the text an answer engine actually quotes.
  assert.ok(d!.twin.includes('STRICT DOES NOT HOLD EVERY DRIFT'));
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
