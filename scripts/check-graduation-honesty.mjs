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

// 3b) GATE OVER-CLAIM GUARD. The drift gate's cardinal honesty rule: it produces
//     a CONTRACT-DIFF ("this tool's contract CHANGED vs your pin"), NOT a safety
//     verdict. It is advisory in JUDGMENT but in-path so it can HOLD.
//
//     LAUNCH-STATE RECONCILIATION (per the value-prop-bible FRAMING DIRECTIVE):
//     the DEPLOY-HELD (A) capabilities - the cloud tier-1 corpus lookup, the
//     tier-2 LLM consult, the tier-3 behavioral verifier, multi-tenant - are
//     CODE-COMPLETE and LIVE at launch, so present-tense claims about them are
//     ALLOWED. What stays forbidden is the MATURITY (B) over-claim that DEPLOYING
//     CANNOT MAKE TRUE: that the gate (or its behavioral tier) PROVES/GUARANTEES a
//     tool SAFE, blocks/prevents attacks, is tamper-proof, or that confidence is
//     CALIBRATED. The behavioral tier CLEARS or REFUTES a contract change - it is
//     not a safety oracle. Two failure modes must never ship:
//       (a) safety over-claims near the gate ("verified safe", "blocks attacks",
//           "guarantees safety", "tamper-proof") - the gate asserts what changed,
//           never that a tool is safe;
//       (b) maturity (B) over-claims: flipping calibrated to true, or asserting
//           the behavioral tier PROVES/GUARANTEES safety (vs the honest
//           "clears/refutes/caught/held").
//     Matched only where "gate" context is present (so the directory screen's own
//     honest copy is not caught). The (A) present-tense capability phrasings
//     ("the behavioral verifier exercises a changed tool", "the cloud tier-1
//     corpus lookup runs", "the full tiered ladder is live") pass cleanly - those
//     are now true at launch. "calibrated=false", "clears or refutes", "not a
//     safety verdict" are the honest forms and pass.
const GATE_SAFETY_CLAIMS = [
  /\bverified safe\b/i,
  /\bguaranteed safe\b/i,
  /\bguarantees safety\b/i,
  /\bguarantees? (?:a tool('?s)? )?safety\b/i,
  /\bproven safe\b/i,
  /\bproves? (?:a |the )?tool('?s)? (?:as )?safe\b/i,
  /\bcertifies? (?:the tool|a tool|tools) (?:as )?safe\b/i,
  /\bgate (?:guarantees|ensures) (?:safety|a safe)\b/i,
  /\btamper[- ]?proof\b/i,
  /\bblocks? attacks?\b/i,
  /\bprevents? attacks?\b/i,
  /\bstops? attacks?\b/i,
];
// (B) MATURITY over-claims: assertions DEPLOYING DOES NOT MAKE TRUE. These are
// forbidden regardless of gate context (the claim is itself the lie). The honest
// forms - "calibrated=false", "calibrated_false", "not yet calibrated", and the
// behavioral tier "clears or refutes / caught / held" - do NOT match. The (A)
// launch-state capability claims (verifier/consult/cloud lookup present-tense)
// are intentionally NOT here: they are live at launch.
const GATE_LIVE_OVERCLAIMS = [
  // confidence calibration flipped to true (calibrated=false is the honest floor)
  /\bcalibrated\s*[:=]\s*true\b/i,
  /\bcalibration\s+(?:is\s+)?complete\b/i,
  /\bconfidences?\s+are\s+calibrated\b/i,
  // the behavioral tier asserted as a safety proof rather than clear/refute
  /behavioral (?:verifier|tier|verification) (?:proves|guarantees|certifies)\b/i,
  /\btier[- ]?3 (?:behavioral )?(?:verifier|tier) (?:proves|guarantees|certifies)\b/i,
];
const GATE_CONTEXT = /\b(?:drift gate|the gate\b|in-path gate|preflight|pre-flight|contract-diff|contract diff|TOFU|HOLD the call|holds? (?:the|a) call)\b/i;

function gateScan(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) gateScan(p);
    else if (/\.(tsx?|json|txt)$/.test(ent.name)) {
      const txt = fs.readFileSync(p, 'utf8');
      const hasGate = GATE_CONTEXT.test(txt);
      // Safety over-claims: forbidden anywhere a gate context exists in the file.
      // A match preceded (within ~40 chars) by a negation cue is an honest
      // DISCLAIMER ("we do NOT claim it blocks attacks", "never verified safe")
      // and is allowed - the lie is the AFFIRMATIVE claim, not the denial of it.
      if (hasGate) {
        const NEG = /\b(?:not|never|n['’]t|no|without|cannot|can['’]t|does not|do not|don['’]t|isn['’]t|aren['’]t|rather than|instead of|claim|claims|claiming)\b/i;
        for (const re of GATE_SAFETY_CLAIMS) {
          const m = re.exec(txt);
          if (!m) continue;
          const before = txt.slice(Math.max(0, m.index - 48), m.index);
          if (NEG.test(before)) continue; // honest disclaimer, not an over-claim
          errors.push(`${path.relative(root, p)} asserts a GATE safety over-claim (${re}). The gate is a CONTRACT-DIFF, not a safety verdict - it asserts what CHANGED, never that a tool is "safe"/"verified"/"blocks attacks". Say "caught the change" / "held the call".`);
        }
      }
      // (B) MATURITY over-claims: forbidden regardless of gate context (the claim
      // is itself the lie - deploying does NOT make it true). The (A) launch-state
      // capability claims are NOT matched here; only flipping calibration to true
      // or asserting the behavioral tier PROVES safety is caught.
      for (const re of GATE_LIVE_OVERCLAIMS) {
        if (re.test(txt)) {
          errors.push(`${path.relative(root, p)} states a (B) MATURITY over-claim (${re}). Deploying does NOT earn this: confidence stays calibrated=false until calibrated against a held-out corpus, and the behavioral tier CLEARS or REFUTES a contract change - it never PROVES a tool safe. Say "calibrated=false" / "clears or refutes" / "caught / held".`);
        }
      }
    }
  }
}
gateScan(path.join(root, 'app'));

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
  // 4c) THE ACCUSATION GATE: the badge may render "flagged" ONLY through a
  //     human 'confirmed' adjudication. A raw screen flag must never publicly
  //     accuse a server (false positives exist - e.g. honest tools over-flagged
  //     on phrasing). Assert there is exactly one `return 'flagged'` and that it
  //     is gated by a 'confirmed' check, so a future edit can't let raw flags
  //     leak to the public badge.
  const flaggedReturns = (code.match(/return\s+'flagged'/g) || []).length;
  if (flaggedReturns !== 1) {
    errors.push(`lib/badge.ts has ${flaggedReturns} \`return 'flagged'\` paths (expected exactly 1, gated on a confirmed adjudication). A raw screen flag must never publicly accuse.`);
  }
  // Brace/newline-tolerant: only require that a 'confirmed' comparison appears
  // shortly before the single `return 'flagged'` - not that it is adjacent, so a
  // faithful refactor (braces, hoisted const) still passes while an ungated
  // return does not.
  if (!/'confirmed'[\s\S]{0,80}?return\s+'flagged'/.test(code)) {
    errors.push("lib/badge.ts: `return 'flagged'` is not gated by a `'confirmed'` check. The accusation gate is broken - only a human-confirmed adjudication may render 'flagged'.");
  }
} catch (err) {
  errors.push(`could not read lib/badge.ts for the badge-honesty check: ${err.message}`);
}

// 5) No public surface may drive a "flagged" label from a RAW flag predicate
//    (a bare `.verdict === 'FAIL'` / removed isFlagged) - that bypasses the
//    accusation gate (the HIGH that shipped firma as publicly "flagged" on the
//    category page). Public surfaces must route through computeBadgeState.
try {
  const offenders = [];
  const scan = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.next') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) scan(p);
      else if (/\.tsx?$/.test(ent.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        if (/\bisFlagged\s*\(/.test(txt) || /import\s*\{[^}]*\bisFlagged\b/.test(txt)) {
          offenders.push(path.relative(root, p));
        }
      }
    }
  };
  scan(path.join(root, 'app'));
  if (offenders.length) {
    errors.push(`raw flag predicate isFlagged() used in public surface(s): ${offenders.join(', ')}. Route through computeBadgeState so unadjudicated false positives are held as "review", not publicly "flagged".`);
  }
} catch (err) {
  errors.push(`could not run the raw-flag-predicate check: ${err.message}`);
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
