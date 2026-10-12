// Public-facts guard. CI-only (web-ci.yml `verify`), plus `npm run check:facts` locally.
//
// Fails when:
//   1. lib/facts.json is malformed, or a rounded value does not round from its raw query output;
//   2. a fact is older than its max_age_days;
//   3. a guarded page (GUARDED_FILES in lib/factsGuard.ts) prints a metric-shaped number as a
//      literal instead of rendering it from the registry or a data file, or an `unsourced`
//      allowlist entry no longer matches (the debt was paid; delete the entry);
//   4. the anchoring sentence in /llms.txt or /llms-full.txt disagrees with
//      data/verdict-anchors.json. On 2026-10-01 llms.txt said "not yet confirmed" while the
//      ledger held 66 confirmed anchors.
//
// --reproduce additionally runs every fact's query and compares the output to the stored value.
// It needs the private mcpindex-trust checkout beside this one, so it is a local step, not CI:
//   npm run check:facts -- --reproduce [--root <dir holding mcpindex-web and mcpindex-trust>]
//
// Run under --conditions=react-server: rendering the llms routes imports server-only modules.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { FACTS } from '../lib/facts';
import {
  ALLOW,
  GUARDED_FILES,
  checkAnchorStatement,
  roundsTo,
  scanFile,
  staleFacts,
  summarizeAnchorLedger,
} from '../lib/factsGuard';

const root = process.cwd();
const args = process.argv.slice(2);
const errors: string[] = [];
const notes: string[] = [];

// --- 1) registry shape + rounding (shape is validated on import) ---------------------------
for (const f of FACTS) {
  if (f.raw !== undefined && typeof f.value === 'number' && !roundsTo(f.raw, f.value)) {
    errors.push(`fact ${f.id}: published ${f.value} is not the rounding of the measured ${f.raw}`);
  }
}

// --- 2) max age -----------------------------------------------------------------------------
// FACTS_TODAY pins the clock for tests; CI uses the real date, so a live fact going stale turns
// every PR red until it is re-measured. That is the point.
const today = process.env.FACTS_TODAY ?? new Date().toISOString().slice(0, 10);
for (const s of staleFacts(FACTS, today)) {
  errors.push(`fact ${s.id} is ${s.ageDays} days old (max_age_days ${s.max}). Re-run its query and update value + observed_at.`);
}

// --- 3) literal metrics in guarded prose ----------------------------------------------------
const used = new Set<number>();
let findings = 0;
for (const file of GUARDED_FILES) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  const r = scanFile(file, src);
  r.used.forEach((i) => used.add(i));
  for (const f of r.findings) {
    findings++;
    errors.push(`${f.file}:${f.line}: literal "${f.literal}" in prose is not rendered from lib/facts.json or a data file - "...${f.context}..."`);
  }
}
ALLOW.forEach((rule, i) => {
  if (rule.kind === 'unsourced' && !used.has(i)) {
    errors.push(`allowlist: unsourced entry ${rule.pattern} no longer matches ${rule.files?.join(', ')}. Remove it from ALLOW in lib/factsGuard.ts.`);
  }
});
const debt = ALLOW.filter((r) => r.kind === 'unsourced');
notes.push(`${debt.length} unsourced literal(s) tolerated as listed debt: ${debt.map((r) => `${r.files?.[0]} ${r.pattern}`).join('; ')}`);

// --- 4) anchoring statement vs the ledger ---------------------------------------------------
const ledgerPath = path.join(root, 'data/verdict-anchors.json');
const ledger = summarizeAnchorLedger(fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : {});
const { GET: llms } = await import('../app/llms.txt/route');
const { GET: llmsFull } = await import('../app/llms-full.txt/route');
for (const [label, get] of [
  ['/llms.txt', llms],
  ['/llms-full.txt', llmsFull],
] as const) {
  const body = await (await get()).text();
  const err = checkAnchorStatement(body, label, ledger);
  if (err) errors.push(err);
}

// --- 5) optional: reproduce every query ------------------------------------------------------
if (args.includes('--reproduce')) {
  const at = args.indexOf('--root');
  const qroot = at >= 0 ? path.resolve(args[at + 1]) : path.resolve(root, '..');
  for (const f of FACTS) {
    let out: string;
    try {
      out = execSync(f.query, { cwd: qroot, encoding: 'utf8', shell: '/bin/zsh', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (e) {
      errors.push(`reproduce ${f.id}: query failed: ${(e as Error).message.split('\n')[0]}`);
      continue;
    }
    const want = f.raw ?? f.value;
    const ok = typeof want === 'number' ? Math.abs(Number(out) - want) < 1e-6 : out === want;
    if (!ok) errors.push(`reproduce ${f.id}: query printed "${out}", registry holds ${JSON.stringify(want)}`);
  }
  notes.push(`reproduced ${FACTS.length} queries from ${qroot}`);
}

for (const n of notes) console.log(`note: ${n}`);
if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\npublic facts guard FAILED: ${errors.length} problem(s) (${findings} unsourced literal(s)).`);
  process.exit(1);
}
console.log(
  `public facts guard OK - ${FACTS.length} facts, ${GUARDED_FILES.length} guarded files, ` +
    `anchoring statement matches ledger (${ledger.confirmed}/${ledger.total} confirmed).`,
);
// The llms routes start module-level caches; do not wait on them.
process.exit(0);
