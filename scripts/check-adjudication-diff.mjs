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
import { createHash } from 'node:crypto';
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

// ------------------------------------------------------------------ PREVIEW-badge ledger (P3)
// The POSITIVE preview-badge ledger (data/preview_badges.jsonl) is durable, cron-re-applied, and
// verdict-AFFECTING exactly like the negative adjudications ledger: verdicts_push_back.sh commits/
// pushes it and adjudicate_preview_badges.py --apply overlays it onto the freshly-rsync'd store
// every cycle. So it needs the SAME tamper-evidence the negative ledger has - append-only prefix +
// per-line well-formedness + a shrink floor - or a truncated/rewritten/fabricated preview ledger
// (a well-formed line that the runtime resanitizer would accept: a deleted confirmed-drift badge, a
// drift->clean flip, a phantom clean badge) ships to prod unchecked. Kept in sync with the write-
// layer invariants in owner_preview_adjudication.py / owner_publish.py (_resanitize_preview_badge,
// _SERVER_ID_FORBIDDEN_RE, _CLEARANCE_CLAIM_RE, PREVIEW_STATES, MAX_ID, _slugify).
const PREVIEW_LEDGER = 'data/preview_badges.jsonl';
const PREVIEW_STATES = new Set(['clean', 'drift', 'inconclusive']);
const PREVIEW_MAX_ID = 512; // mirror tooling.cse.model.MAX_ID
// Mirror owner_preview_adjudication._SERVER_ID_FORBIDDEN_RE (incl. the bidi-override / zero-width /
// line-paragraph separators): ASCII control + C1, markup/quote chars, and Unicode spoof/format chars.
const PREVIEW_SERVER_ID_FORBIDDEN_RE =
  /[\x00-\x1f\x7f-\x9f<>"'&\u200b-\u200d\u202a-\u202e\u2066-\u2069\ufeff\u2028\u2029]/;
// Mirror owner_publish._CLEARANCE_CLAIM_RE (word-boundary positive-clearance claim words). A preview
// badge NEVER asserts a standalone safe/secure/verified/conforming/certified/guaranteed claim.
const PREVIEW_CLEARANCE_CLAIM_RE = /\b(safe|secure|verified|conforming|conformant|certified|guaranteed)\b/i;
// `at` is a full ISO timestamp (entry.decided_at) or an ISO date (the confirm date) - both accepted.
const PREVIEW_AT_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
// A REVOKE tombstone reason (P4): printable, bounded, no control/markup char. Mirrors
// owner_preview_adjudication._REVOKE_REASON_FORBIDDEN_RE / _MAX_REVOKE_REASON.
const PREVIEW_REASON_FORBIDDEN_RE = /[\x00-\x1f\x7f-\x9f<>"'&]/;
const PREVIEW_MAX_REASON = 200;

/** Faithful JS port of tooling.slug_identity.slugify + slug_binds_server_id. */
function slugifyPreview(name) {
  let s = String(name).toLowerCase().split('/').join('--').split('.').join('-').split('@').join('');
  s = s.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  return s;
}

function slugBindsServerId(serverId, slug) {
  const base = slugifyPreview(serverId);
  if (slug === base) return true;
  const hash = createHash('sha256').update(String(serverId), 'utf8').digest('hex').slice(0, 12);
  return slug === `${base}-${hash}`;
}

/** Validate ONE added preview-ledger line against the preview schema; return an error string or null. */
function badPreviewEntry(line, i) {
  let e;
  try {
    e = JSON.parse(line);
  } catch {
    return `added preview line ${i + 1} is not valid JSON: ${line.slice(0, 80)}`;
  }
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return `added preview line ${i + 1} is not a JSON object`;
  if (typeof e.slug !== 'string' || e.slug.trim() === '') return `added preview line ${i + 1} missing/empty "slug"`;
  const sid = e.server_id;
  if (typeof sid !== 'string' || sid.trim() === '') return `added preview line ${i + 1} missing/empty "server_id"`;
  if (sid.length > PREVIEW_MAX_ID) return `added preview line ${i + 1} server_id exceeds MAX_ID (${PREVIEW_MAX_ID})`;
  if (PREVIEW_SERVER_ID_FORBIDDEN_RE.test(sid)) return `added preview line ${i + 1} server_id carries a forbidden markup/control/bidi/zero-width char`;
  if (PREVIEW_CLEARANCE_CLAIM_RE.test(sid)) return `added preview line ${i + 1} server_id makes a positive-clearance claim`;
  if (!slugBindsServerId(sid, e.slug)) return `added preview line ${i + 1} server_id does not round-trip to slug (_slugify(server_id) != slug)`;
  if (typeof e.at !== 'string' || !PREVIEW_AT_RE.test(e.at)) return `added preview line ${i + 1} "at" is not an ISO timestamp`;
  // REVOKE tombstone (P4): kind "revoke" + a well-formed reason, NO badge. The overlay STRIPS the
  // badge for this slug. Append-only + well-formed like a badge line - a truncated/rewritten ledger
  // is still caught by the append-only prefix + floor checks; here we only validate the added line.
  if (e.kind === 'revoke') {
    if (typeof e.reason !== 'string' || e.reason.trim() === '') return `added preview line ${i + 1} revoke missing/empty "reason"`;
    if (e.reason.length > PREVIEW_MAX_REASON) return `added preview line ${i + 1} revoke reason exceeds ${PREVIEW_MAX_REASON} chars`;
    if (PREVIEW_REASON_FORBIDDEN_RE.test(e.reason)) return `added preview line ${i + 1} revoke reason carries a control/markup char`;
    return null;
  }
  const badge = e.badge;
  if (badge === null || typeof badge !== 'object' || Array.isArray(badge)) return `added preview line ${i + 1} "badge" is not a JSON object`;
  if (!PREVIEW_STATES.has(badge.state)) return `added preview line ${i + 1} badge.state "${badge.state}" not in {clean,drift,inconclusive}`;
  if (typeof badge.statement === 'string' && PREVIEW_CLEARANCE_CLAIM_RE.test(badge.statement)) {
    return `added preview line ${i + 1} badge.statement makes a positive-clearance claim`;
  }
  return null;
}

/** Core check: returns an array of error strings (empty = OK). Pure - no I/O. `validator` picks the
 *  per-added-line schema (badEntry for the negative ledger; badPreviewEntry for the preview ledger). */
export function checkAppendOnly(oldText, newText, validator = badEntry) {
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
    const err = validator(newLines[i], i);
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

  // ---- PREVIEW-badge ledger arm (P3) ----------------------------------------------------------
  // (A) pure append-only + preview-wellformedness via checkAppendOnly(..., badPreviewEntry). Proves a
  // deleted / rewritten / fabricated-invalid preview line is REJECTED while a legit append PASSES.
  const gp = (e = {}) => JSON.stringify({
    slug: 'stripe-mcp', server_id: 'stripe-mcp', at: '2026-07-18T00:00:00Z',
    badge: { tier: 'preview', state: 'clean', date: '2026-07-18', server_id: 'stripe-mcp',
      statement: 'Preview - no contract drift observed.' },
    ...e,
  }) + '\n';
  const badge = (state, sid, statement) => ({ badge: { tier: 'preview', state, date: '2026-07-18', server_id: sid, statement } });
  const pOld = gp();
  const pAppend = gp({ slug: 'other-mcp', server_id: 'other-mcp', ...badge('drift', 'other-mcp', 'Preview - contract drift observed.') });
  // A REVOKE tombstone line (P4): kind revoke + slug/server_id/at/reason, NO badge. Append-only.
  const rev = (e = {}) => JSON.stringify({
    kind: 'revoke', slug: 'stripe-mcp', server_id: 'stripe-mcp',
    at: '2026-08-20T00:00:00Z', reason: 'drift-on-recheck:drift', ...e,
  }) + '\n';
  const pCases = [
    ['preview append one good line', pOld, pOld + pAppend, 0],
    ['preview append a well-formed revoke tombstone', pOld, pOld + rev(), 0],
    ['preview revoke missing reason', pOld, pOld + rev({ reason: '' }), 1],
    ['preview revoke reason with a control char', pOld, pOld + rev({ reason: 'badreason' }), 1],
    ['preview revoke slug/server_id mismatch', pOld, pOld + rev({ slug: 'wrong' }), 1],
    ['preview revoke non-ISO at', pOld, pOld + rev({ at: 'not-a-date' }), 1],
    ['preview no change', pOld, pOld, 0],
    ['preview delete a line (shrink)', pOld + pAppend, pOld, 1],
    ['preview rewrite a prior line (drift->clean flip)', pOld, gp(badge('drift', 'stripe-mcp', 'Preview - flipped.')), 1],
    ['preview added line not JSON', pOld, pOld + 'not json\n', 1],
    ['preview added line missing slug', pOld, pOld + JSON.stringify({ server_id: 'z-mcp', at: '2026-07-18', badge: { state: 'clean' } }) + '\n', 1],
    ['preview added line bad state', pOld, pOld + gp({ slug: 'z-mcp', server_id: 'z-mcp', ...badge('cleared', 'z-mcp', 'x') }), 1],
    ['preview added line slug/server_id mismatch', pOld, pOld + gp({ slug: 'wrong', server_id: 'z-mcp', ...badge('clean', 'z-mcp', 'x') }), 1],
    ['preview added line markup in server_id', pOld, pOld + gp({ slug: slugifyPreview('evil<x>'), server_id: 'evil<x>', ...badge('clean', 'evil<x>', 'x') }), 1],
    ['preview added line clearance word in server_id', pOld, pOld + gp({ slug: 'safe-mcp', server_id: 'safe-mcp', ...badge('clean', 'safe-mcp', 'x') }), 1],
    ['preview added line clearance claim in statement', pOld, pOld + gp({ slug: 'z-mcp', server_id: 'z-mcp', ...badge('clean', 'z-mcp', 'This server is certified.') }), 1],
    ['preview added line non-ISO at', pOld, pOld + gp({ slug: 'z-mcp', server_id: 'z-mcp', at: 'not-a-date', ...badge('clean', 'z-mcp', 'x') }), 1],
  ];
  for (const [name, o, n, want] of pCases) {
    const got = checkAppendOnly(o, n, badPreviewEntry).length;
    const pass = want === 0 ? got === 0 : got > 0;
    if (!pass) { console.error(`SELFTEST FAIL: ${name} (wanted ${want ? 'errors' : 'clean'}, got ${got})`); process.exit(1); }
  }
  // (B) --preview-wellformed-only integration (the cron arm): floor + per-line wellformedness on the
  // working-tree data/preview_badges.jsonl. A fabricated-invalid line -> exit 1; a truncated ledger
  // below the floor -> exit 1; a clean append at/above the floor -> exit 0; absent w/ floor 0 -> exit 0.
  const ptmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pwfo-'));
  fs.mkdirSync(path.join(ptmp, 'data'));
  const pLedgerP = path.join(ptmp, 'data', 'preview_badges.jsonl');
  const pwfo = (content, extra = []) => {
    fs.writeFileSync(pLedgerP, content);
    return spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--preview-wellformed-only', ...extra],
      { cwd: ptmp, encoding: 'utf8' }).status;
  };
  if (pwfo(gp()) !== 0) { console.error('SELFTEST FAIL: --preview-wellformed-only rejected a clean preview ledger'); process.exit(1); }
  const forged = gp() + gp({ slug: 'z-mcp', server_id: 'z-mcp', ...badge('certified', 'z-mcp', 'x') }); // bad state
  if (pwfo(forged) !== 1) { console.error('SELFTEST FAIL: --preview-wellformed-only must reject a fabricated-invalid line'); process.exit(1); }
  if (pwfo(gp(), ['--min-lines', '1']) !== 0) { console.error('SELFTEST FAIL: preview 1 line >= floor 1 must pass'); process.exit(1); }
  if (pwfo(gp(), ['--min-lines', '2']) !== 1) { console.error('SELFTEST FAIL: preview 1 line < floor 2 must fail (truncation/shrink)'); process.exit(1); }
  fs.rmSync(pLedgerP, { force: true });
  const pAbsentFloor = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--preview-wellformed-only', '--min-lines', '1'], { cwd: ptmp, encoding: 'utf8' }).status;
  if (pAbsentFloor !== 1) { console.error('SELFTEST FAIL: absent preview ledger with floor>0 must refuse'); process.exit(1); }
  const pAbsentZero = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--preview-wellformed-only'], { cwd: ptmp, encoding: 'utf8' }).status;
  if (pAbsentZero !== 0) { console.error('SELFTEST FAIL: absent preview ledger with floor 0 must pass (pre-first-confirm)'); process.exit(1); }
  fs.rmSync(ptmp, { recursive: true, force: true });

  console.log(`selftest OK (${cases.length} negative + ${pCases.length} preview cases + H1 fail-closed + `
    + `wellformed-only + preview-wellformed-only + append-only floor)`);
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
// `relPath`/`validator`/`label` pick the ledger being gated (negative adjudications or positive
// preview badges) - the SAME floor + per-line-wellformedness discipline for both.
function wellformedOnly(relPath, minLines, validator, label) {
  const p = path.join(process.cwd(), relPath);
  if (!fs.existsSync(p)) {
    if (minLines > 0) {
      console.error(`${label} ABSENT but ${minLines} committed entries expected - refusing (a staged deletion would wipe the ledger).`);
      process.exit(1);
    }
    console.log(`${label} absent; nothing to validate (no committed entries expected)`);
    return;
  }
  const ls = lines(fs.readFileSync(p, 'utf8'));
  if (ls.length < minLines) {
    console.error(`${label} SHRANK: ${ls.length} lines < ${minLines} committed (append-only violated - truncation/rewrite/dropped entries).`);
    process.exit(1);
  }
  for (let i = 0; i < ls.length; i++) {
    const err = validator(ls[i], i);
    if (err) {
      console.error(`${label} WELL-FORMEDNESS FAILED: ${err}`);
      console.error('A conflict marker or malformed/forged line must NEVER be committed to the ledger.');
      process.exit(1);
    }
  }
  console.log(`${label} well-formed (${ls.length} entries, floor ${minLines}).`);
}

// The --base CI arm: enforce append-only prefix + per-added-line well-formedness between the git
// base blob and the working tree, for either ledger.
function baseDiff(base, relPath, validator, label) {
  const root = process.cwd();
  const oldText = gitShow(base, relPath);
  const newText = fs.existsSync(path.join(root, relPath)) ? fs.readFileSync(path.join(root, relPath), 'utf8') : '';
  const errors = checkAppendOnly(oldText, newText, validator);
  if (errors.length) {
    console.error(`${label} guard FAILED (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error('\nThe ledger is append-only and every added entry must be well-formed. If this is a\nlegitimate change, it did not come through the write-layer append path.');
    process.exit(1);
  }
  console.log(`${label} guard OK (append-only, all added entries well-formed).`);
}

const ADJ_LABEL = 'Adjudication-ledger';
const PREVIEW_LABEL = 'Preview-badge ledger';

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  const minLines = () => {
    const mi = args.indexOf('--min-lines');
    const n = mi !== -1 ? parseInt(args[mi + 1], 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  // Cron (direct-push) arms: floor + per-line well-formedness on the working tree.
  if (args.includes('--wellformed-only')) return wellformedOnly(LEDGER, minLines(), badEntry, ADJ_LABEL);
  if (args.includes('--preview-wellformed-only')) return wellformedOnly(PREVIEW_LEDGER, minLines(), badPreviewEntry, PREVIEW_LABEL);
  // PR (CI) arms: append-only prefix + well-formedness against a base ref.
  const pbi = args.indexOf('--preview-base');
  if (pbi !== -1) {
    if (!args[pbi + 1]) { console.error('usage: --preview-base <ref>'); process.exit(2); }
    return baseDiff(args[pbi + 1], PREVIEW_LEDGER, badPreviewEntry, PREVIEW_LABEL);
  }
  const bi = args.indexOf('--base');
  if (bi === -1 || !args[bi + 1]) {
    console.error('usage: check-adjudication-diff.mjs --base <ref> | --preview-base <ref> | --wellformed-only | --preview-wellformed-only | --selftest');
    process.exit(2);
  }
  return baseDiff(args[bi + 1], LEDGER, badEntry, ADJ_LABEL);
}

// Run the CLI when invoked with a recognized flag (deterministic - not a path comparison that
// could fail-open on an unusual argv[0]). Importing checkAppendOnly (no such flag in a test's
// argv) never fires main().
if (['--selftest', '--base', '--preview-base', '--wellformed-only', '--preview-wellformed-only'].some((f) => process.argv.includes(f))) main();
