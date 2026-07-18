// Adjudication-ledger diff guard (CI). CODEOWNERS gates WHO can change
// data/adjudications.jsonl; this gates HOW it may change, so a diff that slips a
// forged or rewritten decision past a human reviewer fails the check regardless.
//
// WHY THIS EXISTS
// The ledger is the one durable, verdict-INVERTING surface in the repo: a single
// `cleared` line flips a flagged server to trusted, and the pushback cron re-applies
// every line to the corpus every cycle (unlike a direct verdicts.json edit, which the
// next rsync self-heals). By contract the ledger is APPEND-ONLY (frontier_adjudication
// _append_ledger only ever appends). So two invariants must hold on any PR that touches
// it, and a violation is either a bug or tampering:
//   1. Append-only: every pre-existing line is preserved, byte-for-byte, as a prefix.
//      Rewriting or deleting a prior decision (e.g. flipping a `confirmed` to `cleared`)
//      is forbidden here.
//   2. Every ADDED line is a well-formed entry: valid JSON, required fields present,
//      decision in {confirmed, cleared}, content_hash sha256-prefixed. A malformed line
//      would be silently skipped by load_ledger at overlay time - caught loudly here.
//
// Usage:
//   node scripts/check-adjudication-diff.mjs --base origin/main   # CI (reads git)
//   node scripts/check-adjudication-diff.mjs --selftest           # unit self-check
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LEDGER = 'data/adjudications.jsonl';
const DECISIONS = new Set(['confirmed', 'cleared']);
const REQUIRED = ['slug', 'content_hash', 'decision', 'reason', 'by', 'at'];
const MAX_BUF = 256 * 1024 * 1024; // git show of a growing append-only ledger; default 1 MiB would ENOBUFS
// Invisible/zero-width chars that JS `\s` (U+FEFF) splits on but Python str.split() does NOT, so a
// `confirmed` reason joined by them would count as multiple words in JS / one in Python and slip a
// bare accusation past the floor. Strip them before counting so JS matches Python (fail-safe).
const ZERO_WIDTH_RE = /[\uFEFF\u200B-\u200D\u2060]/g;
// Mirror the write-layer public-ledger invariants from frontier_adjudication.py (OPERATORS,
// _public_by, the confirmed word-floor). A line authored DIRECTLY in a PR never passed through
// set_adjudication - the exact path this guard polices - so it must not be able to smuggle a
// leaked personal name or an unsubstantiated accusation past the structural check. Keep these
// in sync with OPERATORS / _CONFIRMED_MIN_WORDS on the Python side.
const ALLOWED_BY = new Set(['gautamgb', 'gb', 'reviewer', 'unknown']); // OPERATORS ∪ {reviewer, unknown}
const CONFIRMED_MIN_WORDS = 4;
const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

/** Split a ledger blob into non-empty trimmed lines (trailing newline / blank lines ignored). */
function lines(text) {
  return (text ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

/** Validate ONE added ledger line; return an error string or null. */
function badEntry(line, i) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return `added line ${i + 1} is not valid JSON: ${line.slice(0, 80)}`;
  }
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return `added line ${i + 1} is not a JSON object`;
  for (const f of REQUIRED) {
    if (typeof e[f] !== 'string' || e[f].trim() === '') return `added line ${i + 1} missing/empty field "${f}"`;
  }
  if (!DECISIONS.has(e.decision)) return `added line ${i + 1} has invalid decision "${e.decision}"`;
  if (!SHA256_RE.test(e.content_hash)) return `added line ${i + 1} content_hash is not a sha256:<64-hex> digest`;
  // Mirror the write-layer invariants (see ALLOWED_BY / CONFIRMED_MIN_WORDS above). Case-fold `by`:
  // _public_by matches OPERATORS case-insensitively, so "GB"/"GautamGB" are legitimate handles.
  if (!ALLOWED_BY.has(e.by.toLowerCase())) {
    return `added line ${i + 1} has non-pseudonymized "by":"${e.by}" (must be an operator handle, "reviewer", or "unknown")`;
  }
  const words = e.reason.replace(ZERO_WIDTH_RE, '').trim().split(/\s+/).filter(Boolean).length;
  if (e.decision === 'confirmed' && words < CONFIRMED_MIN_WORDS) {
    return `added line ${i + 1} is a 'confirmed' accusation with a reason under ${CONFIRMED_MIN_WORDS} words`;
  }
  return null;
}

/** Core check: returns an array of error strings (empty = OK). Pure - no I/O. */
export function checkAppendOnly(oldText, newText) {
  const errors = [];
  const oldLines = lines(oldText);
  const newLines = lines(newText);
  // (1) append-only: old lines must be an exact prefix of new lines.
  if (newLines.length < oldLines.length) {
    errors.push(`ledger shrank (${oldLines.length} -> ${newLines.length} lines): entries may not be deleted`);
  }
  const overlap = Math.min(oldLines.length, newLines.length);
  for (let i = 0; i < overlap; i++) {
    if (oldLines[i] !== newLines[i]) {
      errors.push(`existing entry ${i + 1} was modified (ledger is append-only; prior decisions are immutable)`);
      break; // one is enough; the whole prefix is suspect
    }
  }
  // (2) every ADDED line is well-formed.
  for (let i = oldLines.length; i < newLines.length; i++) {
    const err = badEntry(newLines[i], i);
    if (err) errors.push(err);
  }
  return errors;
}

function gitShow(ref, file) {
  // FAIL-CLOSED on any git error. A transient/unresolvable-ref failure must NEVER read as
  // "base ledger was empty" - that would treat every surviving prior line as a fresh addition
  // and silently void the append-only invariant (H1). So: verify the ref RESOLVES first (hard
  // exit if not - the base wasn't fetched; see fetch-depth: 0 in the workflow); only THEN is an
  // absent file a legitimate empty base. A `git show` that errors after both checks is anomalous
  // and is left to throw (uncaught -> non-zero exit -> CI fails).
  const q = { stdio: ['ignore', 'ignore', 'ignore'] };
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], q);
  } catch {
    console.error(`FATAL: base ref "${ref}" does not resolve - cannot verify append-only. ` +
      `Ensure the base is fetched (actions/checkout with fetch-depth: 0).`);
    process.exit(2);
  }
  // Distinguish TRUE absence from any OTHER git failure. ls-tree prints one line iff the path
  // exists in the (already-resolved) ref: empty stdout = genuinely absent (fresh ledger). A
  // non-zero exit (corrupt object, pack error) is NOT swallowed as "absent" - it throws ->
  // fail-closed, never silently an empty base.
  const listed = execFileSync('git', ['ls-tree', ref, '--', file], { encoding: 'utf8' });
  if (listed.trim() === '') return ''; // path absent in this ref -> genuinely a fresh ledger
  return execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8', maxBuffer: MAX_BUF });
}

function selftest() {
  const okOld = '{"a":1}\n{"b":2}\n'; // prior lines are an immutable prefix, never re-validated
  const H = 'sha256:' + 'a'.repeat(64);
  const good = (e) => JSON.stringify({ slug: 's', content_hash: H, decision: 'cleared', reason: 'r', by: 'gb', at: 't', ...e });
  const cases = [
    ['append one good line', okOld, okOld + good({}) + '\n', 0],
    ['no change', okOld, okOld, 0],
    ['delete a line', okOld, '{"a":1}\n', 1],
    ['modify a prior line', okOld, '{"a":9}\n{"b":2}\n', 1],
    ['added line not JSON', okOld, okOld + 'not json\n', 1],
    ['added line missing field', okOld, okOld + '{"slug":"s"}\n', 1],
    ['added line bad decision', okOld, okOld + good({ decision: 'banana' }) + '\n', 1],
    ['added line unprefixed hash', okOld, okOld + good({ content_hash: 'deadbeef' }) + '\n', 1],
    ['added line bare-prefix hash', okOld, okOld + good({ content_hash: 'sha256:' }) + '\n', 1],
    ['added line leaked personal name in by', okOld, okOld + good({ by: 'Jane Q' }) + '\n', 1],
    ['added line by=reviewer pseudonym', okOld, okOld + good({ by: 'reviewer' }) + '\n', 0],
    ['confirmed with thin (1-word) reason', okOld, okOld + good({ decision: 'confirmed', reason: 'scam' }) + '\n', 1],
    ['confirmed with substantiated reason', okOld, okOld + good({ decision: 'confirmed', reason: 'requests env secrets unrelated to file read' }) + '\n', 0],
    ['empty base, one good add', '', good({}) + '\n', 0],
  ];
  let failed = 0;
  for (const [name, o, n, want] of cases) {
    const got = checkAppendOnly(o, n).length;
    const pass = want === 0 ? got === 0 : got > 0;
    if (!pass) {
      failed++;
      console.error(`SELFTEST FAIL: ${name} (wanted ${want ? 'errors' : 'clean'}, got ${got})`);
    }
  }
  if (failed) {
    console.error(`selftest: ${failed} case(s) failed`);
    process.exit(1);
  }
  // H1 integration: the pure cases above never touch gitShow. Exercise the real git path in a
  // child - an unresolvable base ref MUST fail closed (exit 2), never read as an empty base.
  const bogus = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--base', '0'.repeat(40)],
    { encoding: 'utf8' });
  if (bogus.status !== 2) {
    console.error(`SELFTEST FAIL: unresolvable base ref must exit 2 (fail-closed), got ${bogus.status}`);
    process.exit(1);
  }
  // --wellformed-only integration (SC-8): a marker-polluted ledger must exit 1; a clean one exit 0.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wfo-'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const ledgerP = path.join(tmp, 'data', 'adjudications.jsonl');
  const wfo = (content, extra = []) => {
    fs.writeFileSync(ledgerP, content);
    return spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--wellformed-only', ...extra],
      { cwd: tmp, encoding: 'utf8' }).status;
  };
  const H2 = 'sha256:' + 'a'.repeat(64);
  const goodLine = JSON.stringify({ slug: 's', content_hash: H2, decision: 'cleared', reason: 'r', by: 'gb', at: 't' }) + '\n';
  if (wfo(goodLine) !== 0) { console.error('SELFTEST FAIL: --wellformed-only rejected a clean ledger'); process.exit(1); }
  const marker = goodLine + '<<<<<<< Updated upstream\n' + goodLine; // an autostash conflict marker (SC-7)
  if (wfo(marker) !== 1) { console.error('SELFTEST FAIL: --wellformed-only must reject a conflict-marker line'); process.exit(1); }
  // append-only floor (F1): a ledger at/above the committed count passes; below it (shrink) is refused
  if (wfo(goodLine, ['--min-lines', '1']) !== 0) { console.error('SELFTEST FAIL: 1 line >= floor 1 must pass'); process.exit(1); }
  if (wfo(goodLine, ['--min-lines', '2']) !== 1) { console.error('SELFTEST FAIL: 1 line < floor 2 must fail (shrink)'); process.exit(1); }
  // absent ledger with a positive floor -> refuse (a staged deletion would wipe the ledger)
  fs.rmSync(ledgerP, { force: true });
  const absentFloor = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--wellformed-only', '--min-lines', '1'], { cwd: tmp, encoding: 'utf8' }).status;
  if (absentFloor !== 1) { console.error('SELFTEST FAIL: absent ledger with floor>0 must refuse'); process.exit(1); }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`selftest OK (${cases.length} cases + H1 fail-closed + wellformed-only + append-only floor)`);
}

// SC-8: validate EVERY non-blank line of the working-tree ledger is well-formed (valid JSON, required
// fields, content_hash sha256, by-allowlist, confirmed floor). The cron runs this pre-commit so a
// conflict marker or a malformed/field-forged line can never ship on the direct-push path (which
// bypasses the PR-only CI guard). Reuses badEntry() -> no cross-language parity drift.
//
// `minLines` is the APPEND-ONLY FLOOR: the cron passes the committed (git HEAD) ledger line count, so a
// ledger that went ABSENT or SHRANK (an errant rm / truncation / a merge that dropped prior `confirmed`
// lines) is caught here instead of `git add` silently STAGING A DELETION that wipes the entire trust
// ledger to prod (the overlay would then strip every human decision and the heartbeat would still be
// green). A fresh clone with no committed ledger passes minLines=0. This is the tamper-evidence the
// direct path otherwise lacks (the append-only prefix check only runs on the --base CI path).
function wellformedOnly(minLines) {
  const p = path.join(process.cwd(), LEDGER);
  if (!fs.existsSync(p)) {
    if (minLines > 0) {
      console.error(`Adjudication-ledger ABSENT but ${minLines} committed entries expected - refusing (a staged deletion would wipe the ledger).`);
      process.exit(1);
    }
    console.log('ledger absent; nothing to validate (no committed entries expected)');
    return;
  }
  const ls = lines(fs.readFileSync(p, 'utf8'));
  if (ls.length < minLines) {
    console.error(`Adjudication-ledger SHRANK: ${ls.length} lines < ${minLines} committed (append-only violated - truncation/rewrite/dropped entries).`);
    process.exit(1);
  }
  for (let i = 0; i < ls.length; i++) {
    const err = badEntry(ls[i], i);
    if (err) {
      console.error(`Adjudication-ledger WELL-FORMEDNESS FAILED: ${err}`);
      console.error('A conflict marker or malformed/forged line must NEVER be committed to the ledger.');
      process.exit(1);
    }
  }
  console.log(`ledger well-formed (${ls.length} entries, floor ${minLines}).`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  if (args.includes('--wellformed-only')) {
    const mi = args.indexOf('--min-lines');
    const n = mi !== -1 ? parseInt(args[mi + 1], 10) : 0;
    return wellformedOnly(Number.isFinite(n) && n > 0 ? n : 0);
  }
  const bi = args.indexOf('--base');
  if (bi === -1 || !args[bi + 1]) {
    console.error('usage: check-adjudication-diff.mjs --base <ref> | --selftest');
    process.exit(2);
  }
  const base = args[bi + 1];
  const root = process.cwd();
  const oldText = gitShow(base, LEDGER);
  const newText = fs.existsSync(path.join(root, LEDGER)) ? fs.readFileSync(path.join(root, LEDGER), 'utf8') : '';
  const errors = checkAppendOnly(oldText, newText);
  if (errors.length) {
    console.error(`Adjudication-ledger guard FAILED (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\nThe ledger is append-only and every entry must be well-formed. If this is a\nlegitimate change, it did not come through frontier_adjudication.set_adjudication.');
    process.exit(1);
  }
  console.log('Adjudication-ledger guard OK (append-only, all added entries well-formed).');
}

// Run the CLI when invoked with a recognized flag (deterministic - not a path comparison that
// could fail-open on an unusual argv[0]). Importing checkAppendOnly (no such flag in a test's
// argv) never fires main().
if (process.argv.includes('--selftest') || process.argv.includes('--base') || process.argv.includes('--wellformed-only')) main();
