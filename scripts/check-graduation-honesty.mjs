// Graduation-honesty guard. Wired into `npm run build`, so a false
// graduation/enforcement claim CANNOT deploy (the build fails first).
//
// WHY THIS EXISTS
// Registry-screening COVERAGE (data/verdicts.json) is advisory, semantic-only,
// REVIEW/PARTIAL - it grows how many servers have *a* verdict on file. It does
// NOT count toward the D3 graduation gate, which requires
//   >= 150 HUMAN-LABELED conforming tools AND a probed FP upper-95 <= 2%
// (see mcpindex-trust/corpus_eval/GATES.json, "Current 15/150"). Conformance is
// advisory until that gate closes. An automated coverage run must never be able
// to flip the site into claiming graduation or enforcement - that would be a
// false trust claim, the one fatal failure mode for a trust product.
//
// This guard fails the build if any of those false claims appear. Growing
// coverage (more advisory REVIEW verdicts) passes cleanly, as designed.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];

// 1) Coverage data must stay advisory: no ALLOW on a semantic-only screen.
//    (A real conforming ALLOW must have run the conformance probe; a coverage
//    screening that is semantic-only can never legitimately ALLOW.)
try {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/verdicts.json'), 'utf8'));
  const verdicts = Array.isArray(raw) ? raw : Object.values(raw);
  for (const e of verdicts) {
    const v = e.verdict ?? e;
    const decision = v?.directive?.decision;
    const hl = v?.honest_limits ?? [];
    if (decision === 'ALLOW' && hl.includes('semantic_only_no_conformance')) {
      const id = e.slug ?? v?.subject?.server_id ?? 'unknown';
      errors.push(`verdict "${id}" claims ALLOW on a semantic-only screen (no conformance probe ran). Coverage screenings cannot ALLOW.`);
    }
  }
  globalThis.__verdictCount = verdicts.length;
} catch (err) {
  errors.push(`could not read data/verdicts.json: ${err.message}`);
}

// 2) The machine-readable surface must stay pre-graduation + advisory.
try {
  const wk = fs.readFileSync(path.join(root, 'app/.well-known/mcp-index.json/route.ts'), 'utf8');
  if (!/status:\s*'pre_graduation'/.test(wk)) {
    errors.push("/.well-known/mcp-index.json: d3_graduation.status is no longer 'pre_graduation'. Graduation needs a LABELED conforming corpus + probed FP upper-95, not registry coverage.");
  }
  if (!wk.includes('conformance_monitored_not_enforced')) {
    errors.push("/.well-known/mcp-index.json: dropped 'conformance_monitored_not_enforced'. Conformance is advisory until D3 graduation.");
  }
} catch (err) {
  errors.push(`could not read the well-known route: ${err.message}`);
}

// 3) No user-facing surface may claim enforcement or graduation. The forbidden
//    claims are taken verbatim from GATES.json (G-probe-runner) plus coverage-
//    as-graduation phrasings. "15 of 150" / "15/150" (honest) are NOT matched.
const FORBIDDEN = [
  /enforced hybrid/i,
  /conformance (is )?enforced/i,
  /conformance blocks/i,
  /now enforcing/i,
  /\bgate cleared\b/i,
  /status:\s*'(post_graduation|graduated)'/,
  /\b1[05][0-9]\s*of\s*150\b/, // "150 of 150" / "157 of 150" (but not "15 of 150")
  /\b1[05][0-9]\s*\/\s*150\b/, // "150/150" / "157/150" (but not "15/150")
];

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(tsx?|json|txt)$/.test(ent.name)) {
      const txt = fs.readFileSync(p, 'utf8');
      for (const re of FORBIDDEN) {
        if (re.test(txt)) errors.push(`${path.relative(root, p)} contains a forbidden enforcement/graduation claim (${re}).`);
      }
    }
  }
}
walk(path.join(root, 'app'));

// 4) The embeddable badge (lib/badge.ts) is a public trust claim with no link
//    context, so its honesty boundary is stricter: a badge label must never
//    assert safety/certification, and "screened" (an advisory semantic-only
//    pass) must never render green - green is reserved for a real ALLOW that
//    only a conformance probe can earn. Guard both at build time.
try {
  const badge = fs.readFileSync(path.join(root, 'lib/badge.ts'), 'utf8');
  // 4a) banned safety words anywhere in a label string (quote-agnostic so a
  //     reformat to double-quotes can't silently void the check). Assert we
  //     actually parsed labels - zero matches means the regex drifted from the
  //     code and is giving false confidence on the file it polices.
  const labels = [...badge.matchAll(/right:\s*['"]([^'"]*)['"]/g)].map((m) => m[1]);
  if (labels.length < 5) {
    errors.push(`lib/badge.ts: badge-honesty scan parsed only ${labels.length} labels (expected >=5 BADGE_STYLE states). The label regex has drifted from the code - fix it before trusting the safety check.`);
  }
  for (const lbl of labels) {
    if (/\b(safe|verified|trusted|secure|certified|approved)\b/i.test(lbl)) {
      errors.push(`lib/badge.ts badge label "${lbl}" asserts safety/certification - a semantic-only screen cannot. Use a process word (e.g. "screened").`);
    }
    // Width is a 6.5px/char heuristic; an over-long label would clip the pill
    // and silently pass. Bound length so future labels stay within the heuristic.
    if (lbl.length > 16) {
      errors.push(`lib/badge.ts badge label "${lbl}" (${lbl.length} chars) exceeds the 16-char budget the SVG pill-width heuristic safely fits. Shorten it or widen pillWidth deliberately.`);
    }
  }
  // 4b) no badge state may render green - green is reserved for a real ALLOW
  //     (post-conformance). Detect green by COLOR VALUE (not the word, which
  //     legitimately appears in comments): parse every #rrggbb in the code
  //     (comments stripped) and reject any green-dominant hue.
  const code = badge.replace(/\/\/.*$/gm, '');
  for (const m of code.matchAll(/#([0-9a-fA-F]{6})/g)) {
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (g > r + 25 && g > b + 25 && g > 90) {
      errors.push(`lib/badge.ts uses green color #${m[1]} - reserved for a real ALLOW (post-conformance). An advisory badge must not render green.`);
    }
  }
} catch (err) {
  errors.push(`could not read lib/badge.ts for the badge-honesty check: ${err.message}`);
}

if (errors.length) {
  console.error('\n[graduation-guard] BUILD BLOCKED - false trust claim detected:');
  for (const e of errors) console.error('  - ' + e);
  console.error('\nRegistry-screening coverage is advisory and does NOT clear the D3 gate');
  console.error('(>=150 human-labeled conforming tools + probed FP upper-95 <= 2%; see');
  console.error('mcpindex-trust/corpus_eval/GATES.json). Do not raise graduation from coverage.\n');
  process.exit(1);
}

console.log(`[graduation-guard] OK - ${globalThis.__verdictCount ?? '?'} advisory coverage verdicts; gate stays pre_graduation (labeled-conforming gate unaffected).`);
