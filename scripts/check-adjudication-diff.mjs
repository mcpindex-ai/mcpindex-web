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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const LEDGER = 'data/adjudications.jsonl';
const DECISIONS = new Set(['confirmed', 'cleared']);
const REQUIRED = ['slug', 'content_hash', 'decision', 'reason', 'by', 'at'];

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
  if (!e.content_hash.startsWith('sha256:')) return `added line ${i + 1} content_hash is not sha256-prefixed`;
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
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { encoding: 'utf8' });
  } catch {
    return ''; // file absent in base -> everything is an addition
  }
}

function selftest() {
  const okOld = '{"a":1}\n{"b":2}\n';
  const good = (e) => JSON.stringify({ slug: 's', content_hash: 'sha256:x', decision: 'cleared', reason: 'r', by: 'gb', at: 't', ...e });
  const cases = [
    ['append one good line', okOld, okOld + good({}) + '\n', 0],
    ['no change', okOld, okOld, 0],
    ['delete a line', okOld, '{"a":1}\n', 1],
    ['modify a prior line', okOld, '{"a":9}\n{"b":2}\n', 1],
    ['added line not JSON', okOld, okOld + 'not json\n', 1],
    ['added line missing field', okOld, okOld + '{"slug":"s"}\n', 1],
    ['added line bad decision', okOld, okOld + good({ decision: 'banana' }) + '\n', 1],
    ['added line unprefixed hash', okOld, okOld + good({ content_hash: 'deadbeef' }) + '\n', 1],
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
  console.log(`selftest OK (${cases.length} cases)`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
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

// Only run the CLI when invoked directly - importing checkAppendOnly must not fire main().
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
