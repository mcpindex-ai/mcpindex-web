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
    else if (/\.(tsx?|json|txt|md)$/.test(ent.name)) {
      const txt = fs.readFileSync(p, 'utf8');
      for (const re of FORBIDDEN) {
        if (re.test(txt)) errors.push(`${path.relative(root, p)} contains a forbidden enforcement/graduation claim (${re}).`);
      }
    }
  }
}
walk(path.join(root, 'app'));
walk(path.join(root, 'components'));
// content/ (whitepaper.md + guide JSONs) is public long-form copy with no build
// guard of its own - the exact gap that let the whitepaper drift into overclaiming.
walk(path.join(root, 'content'));

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
  /\b(?:tier[- ]?[123]\b|tiers?\s*1\s*[--to]+\s*3|full tiered ladder|the (?:full )?tiered ladder)/i;
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

// For .json content files (e.g. content/guides/*.json), the gate/screen checks must
// run on each STRING VALUE, not the raw file blob: a pretty-printed guide JSON has no
// blank lines and its body's paragraph breaks are escaped `\n\n`, so paragraphs()
// would collapse the whole file to ONE unit and the "held cue must be local" invariant
// would leak across fields (a cue in meta_description excusing an over-claim in body,
// or a gate mention in body exempting the whole file from screenProbeScan). Parse and
// yield each string value with real newlines decoded so locality is per-field. Non-JSON
// (and unparseable JSON) yield the whole text unchanged, preserving prior behavior.
function scanUnits(p, txt) {
  if (p.endsWith('.json')) {
    try {
      const out = [];
      const collect = (v) => {
        if (typeof v === 'string') out.push(v);
        else if (Array.isArray(v)) v.forEach(collect);
        else if (v && typeof v === 'object') Object.values(v).forEach(collect);
      };
      collect(JSON.parse(txt));
      return out.length ? out : [txt];
    } catch {
      return [txt];
    }
  }
  return [txt];
}

function gateScan(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { gateScan(p); continue; }
    // .md excluded here on purpose: the per-paragraph "held cue must be local"
    // heuristics (tier-liveness, screen-probe) are calibrated for short copy and
    // false-positive on long-form prose like content/whitepaper.md, whose honest
    // held-state uses domain vocab (DECLINED/UNAVAILABLE/CONDITIONAL/"only runs
    // when wired") the cue regex does not model. The whitepaper is still guarded
    // by the whole-file FORBIDDEN graduation/enforcement walk(); short guide JSONs
    // keep full coverage here.
    if (!/\.(tsx?|json|txt)$/.test(ent.name)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    for (const txt of scanUnits(p, raw)) {
      const hasGate = GATE_CONTEXT.test(txt);
      // Safety over-claims: forbidden anywhere a gate context exists in the file.
      // Scan EVERY occurrence (matchAll, not the first only) so an affirmative
      // over-claim later in a long file is not masked by an earlier honest
      // disclaimer. A match preceded (within ~48 chars) by a negation cue is an
      // honest DISCLAIMER ("we do NOT claim it blocks attacks") and is allowed -
      // the lie is the AFFIRMATIVE claim, not the denial of it.
      if (hasGate) {
        const NEG = /\b(?:not|never|n['’]t|no|without|cannot|can['’]t|does not|do not|don['’]t|isn['’]t|aren['’]t|rather than|instead of|claim|claims|claiming)\b/i;
        for (const re of GATE_SAFETY_CLAIMS) {
          const gre = re.global ? re : new RegExp(re.source, re.flags + 'g');
          for (const m of txt.matchAll(gre)) {
            // A negation within ~48 chars before the match is an honest disclaimer
            // (the phrase list often spans lines/JSX, so use a raw char window, not a
            // sentence split, to catch a "never"/"don't" on the prior line). matchAll
            // (not exec) so an affirmative over-claim later in a long file is not masked
            // by an earlier honest disclaimer of the same phrase.
            const before = txt.slice(Math.max(0, m.index - 48), m.index);
            if (NEG.test(before)) continue; // honest disclaimer, not an over-claim
            errors.push(`${path.relative(root, p)} asserts a GATE safety over-claim (${re}). The gate is a CONTRACT-DIFF, not a safety verdict - it asserts what CHANGED, never that a tool is "safe"/"verified"/"blocks attacks". Say "caught the change" / "held the call".`);
          }
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
gateScan(path.join(root, 'content'));

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
    if (ent.isDirectory()) { screenProbeScan(p); continue; }
    // .md excluded here on purpose: the per-paragraph "held cue must be local"
    // heuristics (tier-liveness, screen-probe) are calibrated for short copy and
    // false-positive on long-form prose like content/whitepaper.md, whose honest
    // held-state uses domain vocab (DECLINED/UNAVAILABLE/CONDITIONAL/"only runs
    // when wired") the cue regex does not model. The whitepaper is still guarded
    // by the whole-file FORBIDDEN graduation/enforcement walk(); short guide JSONs
    // keep full coverage here.
    if (!/\.(tsx?|json|txt)$/.test(ent.name)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    for (const txt of scanUnits(p, raw)) {
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
screenProbeScan(path.join(root, 'content'));

// 3e) MOAT-EXCLUSIVITY GUARD (behavioral-sampling launch). The sampling moat is
//     CONTRAST ("reading a description is table stakes; mcpindex runs it in a
//     cage") and COMPOUNDING (attested containment + a corpus that sharpens every
//     verdict), NEVER EXCLUSIVITY. A 50+ competitor scan confirms every feature -
//     including the behavioral verdict - is copyable or already exists, so a
//     literal "the only one who runs untrusted tools" / "no one else does this" is
//     a false, trivially-refuted claim that hands a competitor the counter. Fail
//     the build when an exclusivity marker is tied to a run/sandbox/sample/execute
//     verb. Honest contrast copy carries no exclusivity marker and passes. A
//     negation within ~40 chars ("we are NOT the only one") is an honest
//     disclaimer and is allowed.
// The nouns a brag attaches to. `index`/`catalog`/`tool` matter: the product is literally named
// mcpindex, so "the only INDEX that runs untrusted tools" is the likeliest phrasing of all and the
// first version of this list omitted it. `[\s\S]` (not `[^.\n]`) so a claim wrapped across lines by
// JSX/prettier is still caught - copy wraps constantly and a newline must not launder a brag.
// A brag is always about a PEER — never about a "moment" or a "datum". So bind the exclusivity
// marker DIRECTLY to a competitor-class noun and drop the verb coupling entirely. That single
// change fixes both failure directions at once, because both were driven by the same knob
// (marker -> {0,60} -> SUBJ -> {0,60} -> VERB):
//   * FALSE POSITIVES: `the only X` is this site's LIMITING vocabulary, not a brag — "the only
//     datum that transits", "the only thing that leaves", "the only moment trust is actually
//     spent". Those mean *we do LESS than you think*, the opposite of a moat claim; a nearby
//     "runs"/"watches" (which the re-messaging adds everywhere) turned them into build breaks.
//   * FALSE NEGATIVES: a live brag shipped uncaught for want of a verb in the list — docs/page.tsx
//     said "the only one that HITS all four traits". Enumerating verbs is unwinnable.
// Measured on the real repo: honest-scoping FPs 4/10 -> 0/10, missed brags 15/31 -> 2/31.
const _MOAT_SUBJ = '(?:director(?:y|ies)|registr(?:y|ies)|platforms?|services?|vendors?|compan(?:y|ies)|products?|index(?:es)?|catalogs?|tools?|sites?|players?|competitors?|ones?|mcpindex)';
// EXCLUSIVITY SENSE ONLY. `\bonly\b` alone is NOT an exclusivity marker, and matching it bare made
// this guard a hair-trigger on the site's own honesty vocabulary: `only` is a word boundary away
// inside `semantic-only` / `advisory-only` / `read-only`, which is exactly how this product
// describes its LIMITS (whitepaper.md alone has 103 "only"s). Live-caught: app/screen/page.tsx was
// FOUR CHARACTERS of JSX indentation from failing the build — "Advisory and semantic-only. We read
// the description, not the running tool. This screen does not run the ..." chained
// semantic-`only` -> `tool` -> `run`. Reflowing that line would have blocked the build on the very
// disclaimer this guard exists to protect.
//   (?<![-\w])  kills the `-only` compounds (and `readonly`).
//   (?:the|our|its)\s+  requires the possessive/definite frame a real brag uses.
// Every true positive we know of ("the only X", "the only ones", "the sole X", "only mcpindex")
// still matches; verified against the full bypass corpus.
// The determiner frame. `(?<![-\w])` kills the `-only` compounds (`semantic-only`, `read-only`) that
// ARE this site's honesty vocabulary. `(?:\w+['’]s\s+)?` admits a possessive: without it, ANY
// genitive defeated the guard — "the world's only registry", "the industry's only index", "the
// market's only platform" all sailed through (proven). `[*_"“]{0,2}` tolerates emphasis: `the
// **only** registry` is exactly how a marketer writes it at peak loudness, and markdown/JSX markup
// between the determiner and the word broke the adjacency.
// Emphasis/markup that a marketer puts around the loudest word. Markdown stars/underscores, smart
// quotes, AND an inline tag — `the <strong>only</strong> registry` is exactly the peak-loudness
// form, and a tag between the determiner and the word broke adjacency. Bounded (`{0,24}`, no
// nested quantifier over a character class that can match empty) so it cannot backtrack.
const _EMPH = '(?:[*_"“”\'’]|<\\/?[a-zA-Z][^>]{0,24}>){0,4}';
const _ONLY = `(?<![-\\w])(?:the|our|its|your)\\s+${_EMPH}(?:\\w+['’]s\\s+${_EMPH})?(?:only|sole)${_EMPH}\\b`;
const MOAT_EXCLUSIVITY = [
  // "the only registry", "the world's only index", "the **only** catalog", "the only ones".
  // `(?![-\w])` on the SUBJECT, not just the marker: `\bone\b` matches the "one" inside "one-way"
  // (a hyphen is a word boundary), so "the only datum that transits is a one-way SHA" — honest
  // scoping copy in the whitepaper — was blocking the build. Same compound bug as `semantic-only`,
  // which I fixed for the marker and not for the noun.
  new RegExp(`${_ONLY}[\\s\\S]{0,40}\\b${_MOAT_SUBJ}(?![-\\w])`, 'i'),
  // "Only mcpindex …" — the brand as subject; the likeliest phrasing of all.
  new RegExp(`(?<![-\\w])only\\s+${_EMPH}mcpindex\\b`, 'i'),
  // "no one else", "nobody else", "no other registry", "no competitor", "none of our competitors"
  new RegExp(`\\bno\\s+(?![-\\w])?(?:one|body)\\s+else\\b`, 'i'),
  new RegExp(`(?<![-\\w])nobody\\s+else\\b`, 'i'),
  new RegExp(`\\bno\\s+other\\s+${_MOAT_SUBJ}\\b`, 'i'),
  new RegExp(`\\bno\\s+competitors?\\b`, 'i'),
  new RegExp(`\\bnone of (?:our|the) competitors\\b`, 'i'),
  new RegExp(`\\bnowhere else\\b`, 'i'),
  // "first and only", "the first registry to …", "1st and only"
  new RegExp(`\\b(?:first|1st)\\s+and\\s+only\\b`, 'i'),
  new RegExp(`\\bthe\\s+first\\s+${_MOAT_SUBJ}\\s+to\\b`, 'i'),
  // "we alone", "us alone", "mcpindex exclusively", "unmatched", "unrivalled", "one-of-a-kind"
  new RegExp(`\\b(?:we|us|mcpindex)\\s+alone\\b`, 'i'),
  new RegExp(`\\bmcpindex\\s+exclusively\\b`, 'i'),
  new RegExp(`\\bthe\\s+unique\\s+${_MOAT_SUBJ}\\b`, 'i'),
  new RegExp(`\\b(?:unmatched|unrivall?ed|one-of-a-kind|industry-first)\\b`, 'i'),
];
// A NEGATION only disclaims a brag when it is in the SAME SENTENCE. Slicing a raw 40-char window
// (with scanUnits returning a whole non-JSON file as ONE unit) let unrelated earlier lines suppress
// real brags - all three of these were verified to pass silently:
//   "<p>We don't hide it: we are the only registry that runs untrusted tools.</p>"
//   "<p>Descriptions are never enough. We are the only registry that runs them.</p>"
//   'title: "Not a catalog", body: "the only registry that runs untrusted tools"'
// So: bound the lookbehind at the nearest sentence/JSX/quote boundary before the match.
// `n['’]t` ALONE IS DEAD CODE and cannot ever match: `\bn` requires a word boundary before the
// `n`, but in "don't" the n follows `o` (both word chars), so \b fails. The pre-existing GATE
// negation (see NEG in the gate scan above) gets this right by spelling the contractions out; this
// list copied the broken alternative and dropped the working ones, so honest disclaimers like
// "We don't claim to be the only registry that runs untrusted tools" were BLOCKED. Spell them out.
// NEGATION CUES — only forms that actually DISCLAIM the exclusivity.
//   * `\bclaims?\b` is GONE. It suppressed the AFFIRMATIVE brag ("We claim to be the only registry
//     that runs untrusted tools"), and — worse — "claims" is in the locked hero copy itself ("Any
//     directory can read what a tool claims"), so it was a blanket bypass keyed to the vocabulary
//     this guard exists to police. `not`/`never` already cover "We do NOT claim to be the only…".
//     Only the negated claim-forms survive.
//   * `myth`/`unlike` are kept but ONLY matter in their in-clause forms ("It is a myth that…",
//     "Unlike others, we…"). The canonical `Myth: <claim>` / `Unlike the hype: <claim>` shapes are
//     handled by the `myth:`/`unlike…:` prefix check in _sentenceBefore, because the `:` cut would
//     otherwise strip the cue out of the window and BLOCK a myth-buster — the same dead-alternative
//     bug as the `n['’]t` form.
const _MOAT_NEG = /\b(?:not|never|no longer|myth|unlike|rather than|instead of)\b|\b(?:do|does|did|is|are|was|were|has|have|had|would|could|should|ca|wo|ai)n['’]t\b|\b(?:don['’]t|do not|never|cannot|can['’]t)\s+claim\b|\bwrong to (?:say|claim)\b/i;
function _sentenceBefore(txt, idx) {
  // 400, not 240: this guards content/whitepaper.md, whose sentence length is p90=312 / p95=368 —
  // 20% of its lines exceed 240, so a single-sentence disclaimer with its negation at the head was
  // severed from its own claim and blocked.
  const win = txt.slice(Math.max(0, idx - 400), idx);
  // A `Myth: <claim>` / `Unlike the hype: <claim>` PREFIX is a disclaimer frame. The `:` cut below
  // would strip it out of the window, making those cues unreachable for their ONLY canonical form
  // and BLOCKING the myth-buster — the same dead-alternative bug as the `n['’]t` form. Test the RAW
  // window for the frame anywhere before the match (not just abutting it: the claim follows the
  // colon, so the window ends mid-sentence, not at the `:`).
  if (/\b(?:myth|unlike)\b[^.\n\r]{0,80}:/i.test(win)) return win;
  // Bound the negation window at the nearest SENTENCE boundary. Without this, scanUnits hands a
  // whole non-JSON file over as ONE unit and a raw char window slices across unrelated lines, so an
  // earlier "don't"/"never"/"Not" silently excused a real brag further down (3 verified leaks).
  //
  // Do NOT cut at `>` or an apostrophe:
  //   `>` closes every inline JSX tag, so "We are not <strong>the only</strong> registry that
  //       runs tools" lost its "not" and FALSE-POSITIVED (verified).
  //   `'` appears in every contraction — cutting there strips the very negation we look for.
  // `"` and backtick stay: they delimit real units (a JSX prop / a template literal), and keeping
  // them does not re-open the three leaks (re-verified).
  //
  // `:` and `;` are CLAUSE boundaries and are load-bearing. A genuine disclaimer negates the
  // exclusivity ITSELF ("we are NOT the only registry"), so its negation sits in the same clause as
  // the claim. A leak negates something ELSE and then brags after a clause break — "We don't hide
  // it: we ARE the only registry that runs untrusted tools" — where `don't` attaches to *hide*.
  // Dropping the `>` cut (to stop severing JSX disclaimers) re-opened exactly that leak until `:`
  // was added here. Both directions are covered by the corpus.
  // ` - ` IS this site's clause dash: em-dashes are banned by house style, so the whitepaper uses
  // ` - ` 269x vs `:` 259x. Omitting it left the identical leak the `:` cut was added to close —
  // "This is not marketing - we are the only registry that runs untrusted tools" passed.
  //
  // `, ` is deliberately NOT a cut. A comma is not a clause boundary in this voice, it appears
  // constantly WITHIN one, and cutting there severed a real disclaimer: "We do not claim, and have
  // never claimed, ... that we are the only registry that runs untrusted tools" -> the window
  // started at "that we are " and the build BLOCKED. A comma-splice leak is the narrower, rarer
  // case; blocking honest copy is the worse failure for a build gate.
  //
  // The `"` cut is kept (a real JSX-prop boundary) even though it severs a quoted rebuttal — that
  // direction fails CLOSED (blocks a brag-shaped quote), the safe way to be wrong here.
  const cut = Math.max(
    win.lastIndexOf('. '), win.lastIndexOf('! '), win.lastIndexOf('? '),
    win.lastIndexOf('\n'), win.lastIndexOf('"'), win.lastIndexOf('`'),
    win.lastIndexOf(':'), win.lastIndexOf(';'), win.lastIndexOf(' - '),
  );
  return cut >= 0 ? win.slice(cut + 1) : win;
}
function moatScan(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.next') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { moatScan(p); continue; }
    if (!/\.(tsx?|json|txt|md)$/.test(ent.name)) continue;
    const raw = fs.readFileSync(p, 'utf8');
    for (const txt of scanUnits(p, raw)) {
      for (const re of MOAT_EXCLUSIVITY) {
        const gre = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        for (const m of txt.matchAll(gre)) {
          if (_MOAT_NEG.test(_sentenceBefore(txt, m.index))) continue; // honest disclaimer
          errors.push(`${path.relative(root, p)} makes a MOAT-EXCLUSIVITY claim (${re}). The sampling moat is contrast + compounding, never "only we / no one else". Every feature is copyable - say "reading a description is table stakes; mcpindex runs it in a cage" with no exclusivity marker.`);
        }
      }
    }
  }
}
moatScan(path.join(root, 'app'));
moatScan(path.join(root, 'components'));
moatScan(path.join(root, 'content'));

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
      else if (/\.(tsx?|json|txt|md)$/.test(ent.name)) {
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

// ---------------------------------------------------------------------------
// ANCHOR-CLAIM GUARD (G-anchor-real).
//
// tasks/decisions.md D-ANCHOR-2 (2026-05-26) is explicit: an "anchored / provable
// / tamper-proof history" claim is FORBIDDEN until a real external anchor is
// wired. That decision was written down and nothing enforced it, so every server
// page shipped "Verdict history is anchored to Bitcoin via OpenTimestamps" while
// nothing anchored the published verdicts at all.
//
// EVIDENCE SOURCE: data/verdict-anchors.json, IN THIS REPO. The first version of this
// guard read ../mcpindex-trust/corpus_eval/last_anchor.json, which was wrong twice over:
// that file is a smoke byproduct (tools/ci-local.sh restores it after runs), and the
// sibling repo does not exist on Vercel, so the guard silently passed in the only place
// that gates production. The ledger the site publishes is the only honest evidence for a
// claim the site makes - and it ships inside the deployment.
//
// The gate is conditional, not a blanket ban: it fails only while no anchor carries a
// Bitcoin block height, which is exactly when the claim is false.
// "timestamped to Bitcoin" was missing from the first version of this list, and
// app/trust/page.tsx used exactly that wording - so the guard passed a page making the
// forbidden claim in a synonym. Match the CLAIM, not one phrasing of it.
const ANCHOR_CLAIM = /anchored to Bitcoin|Bitcoin[- ]anchored|timestamped to Bitcoin|anchored (?:on|in) (?:the )?Bitcoin|tamper[- ]proof history|provable history|immutable history/i;
// The source-liveness CENSUS is genuinely OTS-anchored - a real .ots proof and a DOI back
// it. Only VERDICT-history anchoring is the forbidden claim, so exempt lines that are
// plainly about the census.
const ANCHOR_EXEMPT = /census|source[- ]liveness|liveness baseline/i;
// A NEGATED mention is a disclaimer, not a claim - "but not Bitcoin-anchored", "not yet
// confirmed", "once confirmed" are exactly the honest phrasings this guard exists to
// encourage, so flagging them would push authors back toward the bare assertion.
const ANCHOR_NEGATED = /\bnot\b[^.]{0,40}(anchored|confirmed)|once confirmed|committed, not|built and committed/i;
// A claim DERIVED from the ledger is the thing this guard exists to encourage, so it must
// not be flagged. lib/verdictAnchor.ts decides the wording from the evidence and is the
// only place allowed to hold the confirmed-state sentence; a surface that renders it under
// a `kind === 'confirmed'` branch cannot assert it while the ledger says otherwise.
// Deliberately narrow: it exempts lines that reference the state machinery, NOT any line
// in a file that happens to import it - an unconditional prose claim sitting three
// paragraphs below a correct conditional one is still a false claim, and still caught.
const ANCHOR_DERIVED = /anchorClaim|anchorState|latestConfirmed|kind === 'confirmed'/;
try {
  const anchorFile = path.join(root, 'data', 'verdict-anchors.json');
  // Fail CLOSED. No ledger means no evidence, which means the claim is unsupported -
  // the opposite of the previous "cannot tell -> allow" default that made this a no-op
  // in CI. Absence of proof is not proof.
  let anchorConfirmed = false;
  if (fs.existsSync(anchorFile)) {
    const led = JSON.parse(fs.readFileSync(anchorFile, 'utf8'));
    if (led?.schema_version !== '1') {
      throw new Error(`verdict-anchors.json: unsupported schema_version ${led?.schema_version}`);
    }
    // Confirmed means a Bitcoin BLOCK HEIGHT, not merely a stamped proof. A pending
    // proof is a calendar receipt; it attests nothing on-chain, and treating the two
    // as equivalent is the overclaim in miniature.
    anchorConfirmed = (led.anchors ?? []).some(
      (a) => (a?.bitcoin?.block_heights?.length ?? 0) > 0,
    );
  }
  if (!anchorConfirmed) {
    const surfaces = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(tsx|ts|md|json)$/.test(e.name)) surfaces.push(full);
      }
    };
    for (const d of ['app', 'components', 'content']) {
      const full = path.join(root, d);
      if (fs.existsSync(full)) walk(full);
    }
    for (const f of surfaces) {
      const body = fs.readFileSync(f, 'utf8');
      // Skip the comment that documents this very guard.
      for (const line of body.split('\n')) {
        if (!ANCHOR_CLAIM.test(line)) continue;
        if (ANCHOR_EXEMPT.test(line) || ANCHOR_NEGATED.test(line)) continue;
        if (ANCHOR_DERIVED.test(line)) continue;
        if (/^\s*(\/\/|\*|\{\/\*)/.test(line)) continue;
        errors.push(
          `${path.relative(root, f)}: asserts Bitcoin/OpenTimestamps anchoring while ` +
          `data/verdict-anchors.json holds no Bitcoin-confirmed anchor. D-ANCHOR-2 ` +
          `forbids this claim until one lands: "${line.trim().slice(0, 80)}"`,
        );
        break;
      }
    }
  }
} catch (err) {
  errors.push(`could not run the anchor-claim scan: ${err.message}`);
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
