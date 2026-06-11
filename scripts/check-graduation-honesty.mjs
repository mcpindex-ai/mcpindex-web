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
//     LAUNCH-STATE RECONCILIATION (per the value-prop-bible FRAMING DIRECTIVE,
//     CORRECTED against the product source 2026-06-04): only tier-0 (the
//     deterministic contract-diff) is an (A) DEPLOY-HELD capability that is LIVE +
//     dogfood-proven at launch. The tiers ABOVE it - the cloud tier-1 corpus
//     lookup (HeldCloudTier1Client is the shipped default; the real client is
//     never wired), the tier-2 LLM consult (HeldLLMJudge ABSTAINs, flag-gated OFF,
//     no live call in this build), and the tier-3 behavioral verifier (no isolator
//     wired by default -> UNAVAILABLE) - are built in-path SEAMS that each require
//     explicit operator OPT-IN. They do NOT "become true the instant we deploy",
//     so a bare present-tense "tier-1/2/3 is live / runs / enabled" is a (B)
//     MATURITY over-claim a buyer disproves by reading the code (see corpus_eval
//     tier1_cloud.py / tier2.py / behavioral.py). Such a claim is ALLOWED only when
//     the SAME paragraph carries a held-state cue (held / by default / opt-in /
//     abstain / not wired / disabled by default / fail-closed / no-op).
//     What also stays forbidden is the MATURITY (B) over-claim that DEPLOYING
//     CANNOT MAKE TRUE: that the gate (or its behavioral tier) PROVES/GUARANTEES a
//     tool SAFE, blocks/prevents attacks, is tamper-proof, or that confidence is
//     CALIBRATED. The behavioral tier CLEARS or REFUTES a contract change - it is
//     not a safety oracle. Three failure modes must never ship:
//       (a) safety over-claims near the gate ("verified safe", "blocks attacks",
//           "guarantees safety", "tamper-proof") - the gate asserts what changed,
//           never that a tool is safe;
//       (b) maturity (B) over-claims: flipping calibrated to true, or asserting
//           the behavioral tier PROVES/GUARANTEES safety (vs the honest
//           "clears/refutes/caught/held").
//       (c) tier-liveness over-claims: stating tier-1/2/3 is live/runs/enabled in
//           a gate context WITHOUT a held-state cue in the same paragraph (they
//           are opt-in seams, not deploy-flips). See GATE_TIER_LIVENESS below.
//     Matched only where "gate" context is present (so the directory screen's own
//     honest copy is not caught). Honest forms pass cleanly: "tier-0 is live; tiers
//     1-3 are held off by default", "the behavioral verifier (held off by default)
//     exercises a changed tool", "calibrated=false", "clears or refutes", "not a
//     safety verdict".
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

// (c) TIER-LIVENESS guard. tiers 1/2/3 are opt-in seams, NOT deploy-flips
// (tier1_cloud.py/tier2.py/behavioral.py: held defaults, never wired). A claim
// that tier 1, 2, or 3 (or "the full tiered ladder", which includes them) is
// live/runs/enabled is only honest when the SAME paragraph also states it is
// held. tier-0 alone is the live leg, so a bare "tier-0 is live" is fine and is
// NOT matched here (the pattern requires a 1/2/3 or "full ladder" subject).
const GATE_TIER_SUBJECT =
  /\b(?:tier[- ]?[123]\b|tiers?\s*1\s*[-–to]+\s*3|full tiered ladder|the (?:full )?tiered ladder)/i;
const GATE_TIER_LIVENESS_VERB =
  /\b(?:is|are)\s+(?:now\s+)?live\b|\bruns?\b|\bexercises?\b|\bescalat\w*\b|\bis\s+active\b|\benabled by default\b|\benabled\b/i;
const GATE_HELD_CUE =
  /\bheld\b|by default|opt[- ]?in|abstains?\b|not wired|disabled by default|fail[- ]?closed|no-op|egress\w*\s+nothing|built (?:as )?(?:in-path )?seams?\b|requires? (?:explicit )?opt/i;

// Split a blob into rough "paragraphs" so the held-cue must be local to the
// claim, not anywhere in the file. JSX/TS source has no blank-line paragraphs in
// a string literal, so we split on blank lines, JSX tag boundaries, and list
// item / sentence-ish boundaries that are coarse but safe (over-splitting only
// makes the guard stricter, which is the safe direction for a (B) protection).
function paragraphs(txt) {
  return txt.split(/\n\s*\n|<\/(?:li|p|h[1-6])>|`,\s*\n|',\s*\n/);
}

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
      // (c) TIER-LIVENESS: a tier-1/2/3 (or "full ladder") liveness claim in a
      // gate context must carry a held-state cue in the SAME paragraph. Tiers
      // 1-3 are opt-in seams, not deploy-flips - a bare "tier-1 runs / the full
      // tiered ladder is live" is the B2 over-claim a buyer disproves in the code.
      if (hasGate) {
        for (const para of paragraphs(txt)) {
          if (!GATE_TIER_SUBJECT.test(para)) continue;
          if (!GATE_TIER_LIVENESS_VERB.test(para)) continue;
          if (GATE_HELD_CUE.test(para)) continue; // honest: held-state stated locally
          const snippet = para.replace(/\s+/g, ' ').trim().slice(0, 120);
          errors.push(`${path.relative(root, p)} claims tier-1/2/3 (or "the full tiered ladder") is live/runs/enabled WITHOUT a held-state cue in the same paragraph: "${snippet}…". Tiers 1-3 are opt-in seams (held defaults in tier1_cloud.py/tier2.py/behavioral.py), not deploy-flips. Add a local "held / by default / opt-in / fail-closed" cue, or scope the live claim to tier-0.`);
        }
      }
    }
  }
}
gateScan(path.join(root, 'app'));
gateScan(path.join(root, 'components'));

// 3c) SCREEN-SCOPE CONFORMANCE-PROBE GUARD (R2-B3 / R2-B4). Mirror of the GATE
//     tier-liveness check, for the OTHER maturity surface: the directory SCREEN.
//     The shipped reality is that all published screen verdicts are REVIEW with
//     honest_limit `semantic_only_no_conformance` (data/verdicts.json) - the
//     deterministic conformance / behavioral probe is BUILT but has NOT run on
//     the public corpus (the G-probe-runner gap). So any present-tense assertion
//     that a conformance / behavioral / deterministic probe "drives" / "runs" /
//     "exercises" a tool ON THE SCREEN is a (B) maturity over-claim a buyer
//     disproves by opening any /server/[slug] page. It is honest only when the
//     SAME paragraph carries a held / roadmap / semantic-only cue.
//
//     Scoped to NON-gate paragraphs: the GATE's tier-0 deterministic contract-
//     diff genuinely IS live + dogfood-proven, so a probe-liveness claim inside a
//     gate-context paragraph is governed by the gate rules above, not this one.
//     This guard targets the screen / directory / methodology-eval surfaces.
const SCREEN_PROBE_SUBJECT =
  /\b(?:conformance probe|behavioral probe|deterministic (?:conformance )?probe|deterministic behavioral probe|live probes?)\b/i;
// Present-tense "it acts on a tool" verbs. "drives the tool", "runs the tool",
// "exercises a (changed) tool", "probes the tool", "checks (whether) ... behaviour".
const SCREEN_PROBE_VERB =
  /\bdrives?\b|\bruns?\b|\bexercises?\b|\bprobes?\b|\bexecutes?\b|\bis\s+run\b|\bare\s+run\b/i;
// Held / roadmap / not-yet-run cues that make the claim honest when local.
const SCREEN_PROBE_HELD_CUE =
  /\bbuilt (?:but )?(?:not|has not)\b|not (?:yet )?run|has not (?:yet )?run|not yet run|roadmap|semantic[- ]?only|semantic_only|monitored,?\s+not enforced|gated to (?:the )?D3|D3 (?:labeled[- ]?corpus )?milestone|when (?:it|the probe) runs|once (?:the|it).{0,40}run|held off by default|opt[- ]?in|not produced at v1|reserved in the contract/i;

function screenProbeScan(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) screenProbeScan(p);
    else if (/\.(tsx?|json|txt)$/.test(ent.name)) {
      const txt = fs.readFileSync(p, 'utf8');
      for (const para of paragraphs(txt)) {
        if (!SCREEN_PROBE_SUBJECT.test(para)) continue;
        if (!SCREEN_PROBE_VERB.test(para)) continue;
        // If THIS paragraph is gate-context, the gate rules govern it (the gate's
        // tier-0 deterministic contract-diff is genuinely live). Skip here.
        if (GATE_CONTEXT.test(para)) continue;
        if (SCREEN_PROBE_HELD_CUE.test(para)) continue; // honest: held/roadmap stated locally
        const snippet = para.replace(/\s+/g, ' ').trim().slice(0, 120);
        errors.push(`${path.relative(root, p)} asserts a conformance/behavioral probe present-tense DRIVES/RUNS/EXERCISES a tool on a non-gate (screen) surface WITHOUT a held/roadmap cue in the same paragraph: "${snippet}…". The screen is semantic-only today (all verdicts are REVIEW/semantic_only_no_conformance; the probe is built but has not run on the public corpus). Add a local "built but not yet run / semantic-only / gated to D3 / when it runs" cue, or scope the probe-liveness claim to the GATE's tier-0.`);
      }
    }
  }
}
screenProbeScan(path.join(root, 'app'));
screenProbeScan(path.join(root, 'components'));

// 3d) INSTALL-ARTIFACT LINK CHECK (R2-B1) + GATE PACKAGE-NAME COHERENCE (R2-B2).
//     The wedge's own install must not 404 and must not name an unresolvable
//     package. PUBLISH-COUPLING needs a mechanical guard, not a discipline note.
//   (a) every `mcpindex.ai/<file>.{sh,ps1,mcpb}` literal referenced in app/ must
//       resolve to a served file under web/public/ (a .mcpb that does not exist
//       must not be advertised).
//   (b) the gate package name the site tells users to install must equal the PKG
//       the shipped installer (public/install.sh) actually installs - so site
//       copy and the installer cannot silently desync before the wheel is
//       published in lockstep.
try {
  const publicDir = path.join(root, 'public');
  const referenced = new Set();
  const appWalk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.next') continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) appWalk(p);
      else if (/\.(tsx?|json|txt)$/.test(ent.name)) {
        const txt = fs.readFileSync(p, 'utf8');
        for (const m of txt.matchAll(/mcpindex\.ai\/([A-Za-z0-9._-]+\.(?:sh|ps1|mcpb))\b/g)) {
          referenced.add(m[1]);
        }
      }
    }
  };
  appWalk(path.join(root, 'app'));
  for (const fname of referenced) {
    if (!fs.existsSync(path.join(publicDir, fname))) {
      errors.push(`install-artifact link check: app/ references https://mcpindex.ai/${fname} but web/public/${fname} is not served. The wedge's own install path would 404 at go-live. Copy the artifact into web/public/ (publish-coupled), or remove the reference.`);
    }
  }
  // (b) package-name coherence: the installer is the source of truth for the
  // gate package name. Site copy must match PKG="..." in public/install.sh.
  const installShPath = path.join(publicDir, 'install.sh');
  if (fs.existsSync(installShPath)) {
    const installSh = fs.readFileSync(installShPath, 'utf8');
    const pkgM = installSh.match(/PKG=["']([^"']+)["']/);
    if (!pkgM) {
      errors.push('package-name coherence: could not find PKG="..." in public/install.sh. The installer must declare the gate package name so site copy can be checked against it.');
    } else {
      const pkg = pkgM[1];
      // The docs install copy names the gate package in `uv tool install <pkg>`
      // and `uvx --from <pkg>`. Assert at least one of those names the SAME pkg.
      const docs = fs.readFileSync(path.join(root, 'app/docs/page.tsx'), 'utf8');
      const escaped = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const namesIt = new RegExp(`uv(?:x)?\\b[^\\n]*${escaped}`).test(docs) ||
        new RegExp(`--from\\s+${escaped}`).test(docs) ||
        new RegExp(`uv tool install\\s+${escaped}`).test(docs);
      if (!namesIt) {
        errors.push(`package-name coherence: public/install.sh installs PKG="${pkg}", but app/docs/page.tsx does not name "${pkg}" in its uv install copy. Site copy and the installer have desynced - reconcile (PUBLISH-COUPLING: the published wheel name must match both).`);
      }
    }
  }
} catch (err) {
  errors.push(`could not run the install-artifact / package-name check: ${err.message}`);
}

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

// DRIFT-NETWORK FLAGS MUST STAY OFF BY DEFAULT. The authenticated-corroboration
// surface (WS-A/B/C) is honest ONLY while dormant by default: install identity +
// ingest-auth gate on DRIFT_IDENTITY, the dark installs-plane READ gates on
// DRIFT_DARK_CORROBORATION, and the OAuth cost-class upgrade gates on
// DRIFT_OAUTH_UPGRADE. If committed code drops one of those env guards or hard
// force-enables a flag, the site would publicly serve forgeable install
// corroboration (or a live OAuth surface) that has NOT cleared its go-live gate -
// a false trust claim. Fail the build on either regression.
const FLAG_GUARDS = [
  { file: 'lib/driftIdentity.ts', needle: "process.env.DRIFT_IDENTITY === '1'", flag: 'DRIFT_IDENTITY' },
  { file: 'lib/driftOAuth.ts', needle: "process.env.DRIFT_OAUTH_UPGRADE === '1'", flag: 'DRIFT_OAUTH_UPGRADE' },
  { file: 'lib/driftQuery.ts', needle: "process.env.DRIFT_DARK_CORROBORATION !== '1'", flag: 'DRIFT_DARK_CORROBORATION' },
];
for (const g of FLAG_GUARDS) {
  try {
    const txt = fs.readFileSync(path.join(root, g.file), 'utf8');
    if (!txt.includes(g.needle)) {
      errors.push(`${g.file}: the ${g.flag} OFF-by-default env guard ("${g.needle}") is gone. The drift-network surface must stay dormant until its go-live gate clears.`);
    }
  } catch (err) {
    errors.push(`could not read ${g.file} for the ${g.flag} flag-guard check: ${err.message}`);
  }
}
// A single-'=' assignment to one of these env flags would force-enable the surface
// at runtime regardless of deploy config. The `=(?!=)` excludes the legit comparisons
// (=== / == / !==); any remaining single-'=' assignment is caught regardless of the
// RHS form (a quoted '1', String(1), a backtick, or a variable) - there is no honest
// reason to ASSIGN to one of these env flags in committed code.
const FORCE_ENABLE = /process\.env\.DRIFT_(IDENTITY|OAUTH_UPGRADE|DARK_CORROBORATION)\s*=(?!=)/;
const scanForceEnable = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) scanForceEnable(p);
    else if (/\.tsx?$/.test(ent.name) && !/\.test\.tsx?$/.test(ent.name)) {
      if (FORCE_ENABLE.test(fs.readFileSync(p, 'utf8'))) {
        errors.push(`${path.relative(root, p)} force-enables a drift-network flag by assignment. These flags must come from the deploy env only.`);
      }
    }
  }
};
try {
  scanForceEnable(path.join(root, 'lib'));
  scanForceEnable(path.join(root, 'app'));
} catch (err) {
  errors.push(`could not run the drift-flag force-enable scan: ${err.message}`);
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
