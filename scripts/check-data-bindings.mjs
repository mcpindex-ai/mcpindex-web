// Verify that every DERIVED data artifact binds to the inputs sitting beside it right now.
//
// WHY IT IS A SCRIPT AND NOT AN INLINE WORKFLOW STEP. The checks used to be inline `node -e`
// blocks that ran ONCE, before the push/rebase retry loop, and never again. A rebase can move
// the inputs out from under an already-verified artifact:
//
//   sync starts with admitted.json = A1 -> builds an index bound to (S2, A1) -> checks pass
//   -> push rejected -> `git rebase origin/main`, where main now carries A2
//   -> `git checkout --theirs` restores only the four files the sync WRITES, so admitted.json
//      comes from the new main = A2
//   -> the run commits an index bound to A1 sitting beside A2, and nothing re-verifies.
//
// The resulting push is data-only, so web-ci.yml's path filter skips it too. An editorially
// admitted server would then be missing from the site until the next sync, silently. Being a
// script means the workflow can call this again after every rebase, which is the fix.
//
// Fails closed. The next sync regenerates from a clean tree.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const digest = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const fail = (m) => {
  console.error(`::error::${m}`);
  process.exitCode = 1;
};

const snapshotSha = digest('data/snapshot.json');
const admittedSha = digest('data/admitted.json');

// --- slug map -----------------------------------------------------------------------------
const m = JSON.parse(readFileSync('data/slugmap.json', 'utf8'));
if (m.inputs.snapshot_sha256 !== snapshotSha) {
  fail('slugmap.json does not bind to the snapshot beside it. The screener would key verdicts against a stale map.');
}
if (m.inputs.admitted_sha256 !== admittedSha) {
  fail('slugmap.json does not bind to data/admitted.json beside it.');
}
const mapCount = Object.keys(m.servers).length;
if (mapCount !== m.counts.servers) fail('slugmap counts disagree with its payload');
if (new Set(Object.values(m.servers)).size !== mapCount) {
  fail('slugmap is not injective - two names share a slug');
}

// --- server index -------------------------------------------------------------------------
// Strictly more dangerous stale than the slug map: lib/registry.ts loadServers() PREFERS this
// file, so a stale one means the site serves the OLD catalog while the new snapshot.json sits
// beside it unread.
const d = JSON.parse(readFileSync('data/server-index.json', 'utf8'));
if (d.inputs.snapshot_sha256 !== snapshotSha) {
  fail('server-index.json does not bind to the snapshot beside it. loadServers() prefers this file, so the site would serve a stale catalog.');
}
if (d.inputs.admitted_sha256 !== admittedSha) {
  fail('server-index.json does not bind to data/admitted.json beside it.');
}
if (d.counts.servers !== d.servers.length) fail('server-index counts disagree with its payload');
if (d.counts.deprecated !== d.deprecated.length) fail('server-index deprecated counts disagree with its payload');

// Active and deprecated share one slug space: a deprecated row aliasing a live slug would let
// a retired subject answer at the live subject's URL.
const all = [...d.servers, ...d.deprecated];
if (new Set(all.map((s) => s.slug)).size !== all.length) {
  fail('server-index is not injective - two subjects share a public slug');
}

// --- the two derived files must agree with each other ---------------------------------------
// Catches the real failure: one regenerated and the other not.
if (mapCount !== d.servers.length) {
  fail(`slugmap (${mapCount}) and server-index (${d.servers.length}) disagree on server count - one is stale`);
}
for (const s of d.servers) {
  if (m.servers[s.name] !== s.slug) {
    fail(`slugmap and server-index disagree on the slug for ${s.name}`);
    break;
  }
}

if (!process.exitCode) {
  console.log(
    `data bindings OK: ${d.servers.length} servers + ${d.deprecated.length} deprecated, ` +
      `bound to snapshot + admitted, injective, slugmap agrees`,
  );
}
