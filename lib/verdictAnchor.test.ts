import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  anchorClaim,
  anchorState,
  loadAnchorLedger,
  verifyAnchorLedgerShape,
  type AnchorEntry,
} from './verdictAnchor';

function entry(over: Partial<AnchorEntry> & { seq: number }): AnchorEntry {
  const cr = over.chain_root ?? `sha256:${String(over.seq).padStart(64, 'c')}`;
  return {
    root: `sha256:${String(over.seq).padStart(64, 'r')}`,
    prev_root: null,
    chain_root: cr,
    verdict_count: 18415,
    stamped_at: '2026-07-27T04:20:00Z',
    proof: `anchors/${cr.replace(/^sha256:/, '')}.ots`,
    ...over,
  };
}

function chain(n: number): AnchorEntry[] {
  const out: AnchorEntry[] = [];
  for (let i = 1; i <= n; i++) {
    out.push(entry({ seq: i, prev_root: i === 1 ? null : out[i - 2].root }));
  }
  return out;
}

test('an empty ledger is "none", never silently treated as anchored', () => {
  assert.equal(anchorState([]).kind, 'none');
  assert.match(anchorClaim(anchorState([])), /no anchor has been published/i);
  assert.doesNotMatch(anchorClaim(anchorState([])), /anchored to Bitcoin/i);
});

test('a stamped but unconfirmed proof is PENDING, not anchored', () => {
  // The distinction the whole module exists for: `ots stamp` returns a calendar receipt
  // that attests nothing on-chain. Calling that "anchored to Bitcoin" is the overclaim.
  const s = anchorState(chain(2));
  assert.equal(s.kind, 'pending');
  const claim = anchorClaim(s);
  assert.match(claim, /not yet confirmed/i);
  assert.doesNotMatch(claim, /anchored to Bitcoin/i);
});

test('an empty block_heights array does NOT count as confirmed', () => {
  // A truthy `bitcoin` object with nothing in it is exactly what a half-finished upgrade
  // writes; a `bitcoin ? confirmed : pending` check would read it as proof.
  const led = chain(1);
  led[0].bitcoin = { block_heights: [], block_hashes: [] };
  assert.equal(anchorState(led).kind, 'pending');
});

test('one block height makes the claim true, and it names the block', () => {
  const led = chain(3);
  led[1].bitcoin = { block_heights: [951197], block_hashes: ['ab'] };
  const s = anchorState(led);
  assert.equal(s.kind, 'confirmed');
  if (s.kind !== 'confirmed') throw new Error('unreachable');
  assert.equal(s.confirmed, 1);
  assert.equal(s.total, 3);
  assert.equal(s.latestConfirmed.seq, 2);
  assert.match(anchorClaim(s), /anchored to Bitcoin via OpenTimestamps/);
  assert.match(anchorClaim(s), /951,197/);
});

test('latestConfirmed is the newest confirmed entry, not the newest entry', () => {
  // The page cites a block height; citing the latest ENTRY would print "undefined" (or
  // worse, a stale height) whenever the most recent anchor is still pending - which is
  // the normal state for several hours after every stamp.
  const led = chain(3);
  led[0].bitcoin = { block_heights: [900000] };
  led[1].bitcoin = { block_heights: [951197] };
  const s = anchorState(led);
  if (s.kind !== 'confirmed') throw new Error('expected confirmed');
  assert.equal(s.latest.seq, 3, 'latest is still the newest entry');
  assert.equal(s.latestConfirmed.seq, 2, 'latestConfirmed skips the pending tail');
  assert.match(anchorClaim(s), /951,197/);
});

test('a broken chain throws rather than rendering', () => {
  const gap = [entry({ seq: 1 }), entry({ seq: 3 })];
  assert.throws(() => verifyAnchorLedgerShape(gap), /seq 3 != 2/);

  const bad = chain(2);
  bad[1].prev_root = 'sha256:' + 'f'.repeat(64);
  assert.throws(() => verifyAnchorLedgerShape(bad), /prev_root mismatch/);

  const swapped = chain(2);
  swapped[1].proof = swapped[0].proof;
  assert.throws(() => verifyAnchorLedgerShape(swapped), /proof path does not match/);
});

test('anchorState verifies before reporting, so a tampered ledger cannot claim', () => {
  const bad = chain(2);
  bad[1].prev_root = 'sha256:' + 'f'.repeat(64);
  bad[1].bitcoin = { block_heights: [951197] };
  assert.throws(() => anchorState(bad), /prev_root mismatch/);
});

test('a missing ledger file reads as pre-genesis; a malformed one throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-'));
  const p = path.join(dir, 'verdict-anchors.json');
  assert.deepEqual(loadAnchorLedger(p), []);

  fs.writeFileSync(p, JSON.stringify({ schema_version: '99', anchors: [] }));
  assert.throws(() => loadAnchorLedger(p), /unsupported schema_version/);

  fs.writeFileSync(p, '{ not json');
  assert.throws(() => loadAnchorLedger(p));

  fs.writeFileSync(p, JSON.stringify({ schema_version: '1', anchors: 'nope' }));
  assert.throws(() => loadAnchorLedger(p), /not an array/);

  fs.writeFileSync(p, JSON.stringify({ schema_version: '1', anchors: chain(2) }));
  assert.equal(loadAnchorLedger(p).length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('every claim string is honest about what it is claiming', () => {
  // Asserted against the literal output on purpose. These three sentences are the entire
  // public surface of the anchor, and the failure being guarded against is a well-meaning
  // edit that upgrades "submitted" to "anchored" in the pending branch.
  assert.equal(
    anchorClaim({ kind: 'none' }),
    'Verdict history is hash-chained. Bitcoin anchoring via OpenTimestamps is built but no anchor has been published yet.',
  );
  const led = chain(1);
  assert.equal(
    anchorClaim(anchorState(led)),
    'Verdict history is hash-chained, and the chain root is submitted to OpenTimestamps (1 anchor); the Bitcoin attestation is not yet confirmed.',
  );
});
