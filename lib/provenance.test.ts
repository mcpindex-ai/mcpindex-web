import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorProvenance, buildProvenance, provenanceLine, RANKING_BASIS, CATALOG_BASIS } from './provenance';
import { ADVISORY_FLOOR } from './honest-limits';
import type { AnchorEntry, AnchorState } from './verdictAnchor';

function entry(over: Partial<AnchorEntry> = {}): AnchorEntry {
  const cr = over.chain_root ?? `sha256:${'c'.repeat(64)}`;
  return {
    seq: 1,
    root: `sha256:${'r'.repeat(64)}`,
    prev_root: null,
    chain_root: cr,
    verdict_count: 18440,
    stamped_at: '2026-07-28T04:24:20Z',
    proof: `anchors/${cr.replace(/^sha256:/, '')}.ots`,
    ...over,
  };
}

const confirmed: AnchorState = {
  kind: 'confirmed',
  latest: entry(),
  latestConfirmed: entry({ bitcoin: { block_heights: [959933] } }),
  total: 2,
  confirmed: 1,
};

test('a PENDING anchor serialises as no anchor at all', () => {
  // The distinction the whole module turns on. `ots stamp` returns a calendar receipt
  // that attests nothing on-chain; a consumer seeing an `anchor` key would read it as
  // settled. The honest wire value is its absence, not a half-populated object.
  const pending: AnchorState = { kind: 'pending', latest: entry(), total: 1 };
  assert.equal(anchorProvenance(pending), null);
  assert.equal(buildProvenance({ basis: 'x', state: pending }).anchor, null);
});

test('no ledger serialises as no anchor', () => {
  assert.equal(anchorProvenance({ kind: 'none' }), null);
  assert.equal(buildProvenance({ basis: 'x', state: { kind: 'none' } }).anchor, null);
});

test('a confirmed anchor carries the block, the proof URL and a verify link', () => {
  const a = anchorProvenance(confirmed);
  assert.ok(a);
  assert.equal(a.bitcoin_block, 959933);
  assert.equal(a.chain_root, `sha256:${'c'.repeat(64)}`);
  assert.equal(a.proof, `https://mcpindex.ai/anchors/${'c'.repeat(64)}.ots`);
  assert.equal(a.verify, 'https://mcpindex.ai/trust#anchor');
});

test('the proof URL comes from the ledger entry, not rebuilt from the chain root', () => {
  // If the URL were reconstructed, it could point at a file the ledger does not vouch for.
  // Pin that it echoes `entry.proof` even when the two would disagree.
  const odd = entry({ chain_root: `sha256:${'a'.repeat(64)}`, proof: `anchors/${'b'.repeat(64)}.ots` });
  const a = anchorProvenance({ kind: 'confirmed', latest: odd, latestConfirmed: { ...odd, bitcoin: { block_heights: [1] } }, total: 1, confirmed: 1 });
  assert.equal(a?.proof, `https://mcpindex.ai/anchors/${'b'.repeat(64)}.ots`);
});

test('the advisory floor is always present and cannot be replaced by a caller', () => {
  const p = buildProvenance({ basis: 'x', limits: ['extra_token'], state: { kind: 'none' } });
  for (const l of ADVISORY_FLOOR) assert.ok(p.limits.includes(l), `missing floor token ${l}`);
  assert.ok(p.limits.includes('extra_token'));
});

test('an omitted limits array still gets the floor', () => {
  const p = buildProvenance({ basis: 'x', state: { kind: 'none' } });
  assert.deepEqual(p.limits, [...ADVISORY_FLOOR]);
});

test('snapshot is present only when supplied', () => {
  assert.equal(buildProvenance({ basis: 'x', state: { kind: 'none' } }).snapshot, undefined);
  const p = buildProvenance({
    basis: 'x',
    snapshot: { version: 'v9', written_at: '2026-07-28T00:00:00Z' },
    state: { kind: 'none' },
  });
  assert.deepEqual(p.snapshot, { version: 'v9', written_at: '2026-07-28T00:00:00Z' });
});

test('the ranking basis says a rank is not a safety verdict', () => {
  // An agent handed `qualityScore: 84` with no basis reads it as a safety signal. This is
  // the sentence that stops that, so it is pinned rather than left to a future edit.
  assert.match(RANKING_BASIS, /not a safety verdict/i);
  assert.match(CATALOG_BASIS, /publisher's own claims/i);
});

test('provenanceLine mentions Bitcoin ONLY when a block is confirmed', () => {
  const pendingLine = provenanceLine({ kind: 'pending', latest: entry(), total: 1 });
  assert.doesNotMatch(pendingLine, /Bitcoin/i);
  assert.match(pendingLine, /advisory/i);

  const confirmedLine = provenanceLine(confirmed);
  assert.match(confirmedLine, /Bitcoin block 959933/);
  assert.match(confirmedLine, /mcpindex\.ai\/trust#anchor/);
});

test('provenanceLine stays short enough to ride on every MCP tool result', () => {
  // It is prepended to agent-facing text on every call, so length is a real cost.
  assert.ok(provenanceLine(confirmed).length < 200, provenanceLine(confirmed));
});
