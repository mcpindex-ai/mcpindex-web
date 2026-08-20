// Diagram freshness guard. Wired into `npm run build`, so a figure that has gone stale,
// orphaned, or off-claim CANNOT deploy - the build fails first.
//
// WHY THIS EXISTS
// A diagram is the easiest thing on a site to let rot. It looks finished, nobody re-reads it,
// and it keeps asserting last quarter's architecture long after the code moved. This repo has
// already paid for exactly that failure once: the source-liveness page hand-copied its census
// figures and contradicted its own DOI for four days (see lib/sourceLiveness.ts).
//
// Three classes of rot, three defences:
//
//   1. NUMBERS AND ENUMERATIONS drift when they are copied. So they are never copied - every
//      figure declares `derives` and reads from the single source. This guard rejects
//      fact-shaped literals (thousands separators, percentages) inside diagram components, so
//      the only legal way to get a changing number into a figure is a prop.
//
//   2. CAPABILITY STATE flips when we ship. A figure saying "tiers 1-3 are held off" becomes a
//      lie the day tier-1 goes live. So each state-bearing figure declares a `tripwire`, and
//      this guard re-asserts it against its source. The build fails at the exact commit that
//      changes the capability, and names the figure to update. That is the alert.
//
//   3. PLACEMENT rots silently when a page is rewritten. Each figure declares where it is
//      rendered; this guard fails if the page no longer references it, so a rewrite cannot
//      quietly orphan a figure that the sitemap and the gallery still advertise.
//
// Plus the two rules that are cheap to state and easy to forget: the claim vocabulary (a
// contract-diff, never a safety verdict) and the accent-contrast floor.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

// --- parse the registry ------------------------------------------------------
// Text-scanned rather than imported, matching check-graduation-honesty.mjs: the guard must run
// under plain node in the build step, with no TS loader in the path.
const registrySrc = read('lib/diagrams.ts');
const entries = [];
{
  const idRe = /^\s{4}id: '([^']+)',$/gm;
  const marks = [...registrySrc.matchAll(idRe)];
  marks.forEach((m, i) => {
    const start = m.index;
    const end = i + 1 < marks.length ? marks[i + 1].index : registrySrc.length;
    const block = registrySrc.slice(start, end).replace(/\s+/g, ' ');
    const one = (re) => (block.match(re) ?? [])[1];
    const list = (key) => {
      const raw = one(new RegExp(`${key}: \\[([^\\]]*)\\]`));
      if (!raw) return [];
      return [...raw.matchAll(/'([^']*)'/g)].map((x) => x[1]);
    };
    entries.push({
      id: m[1],
      fig: one(/fig: '([^']+)'/),
      claim: one(/claim: [`']([^`']+)/),
      alt: one(/alt: [`']([^`']+)/),
      placements: list('placements'),
      derives: list('derives'),
      tripwire: one(/tripwire: '([^']+)'/),
      reviewed: one(/reviewed: (REVIEWED|'[\d-]+')/),
    });
  });
}

if (entries.length === 0) {
  errors.push('could not parse any diagram from lib/diagrams.ts - the registry format changed.');
}

// --- 1) registry <-> component parity ---------------------------------------
const indexSrc = read('components/diagrams/index.tsx');
for (const e of entries) {
  if (!indexSrc.includes(`'${e.id}':`)) {
    errors.push(`diagram "${e.id}" is in the registry but has no renderer in components/diagrams/index.tsx`);
  }
}
for (const m of indexSrc.matchAll(/^\s{2}'([a-z0-9-]+)':/gm)) {
  if (!entries.some((e) => e.id === m[1])) {
    errors.push(`renderer "${m[1]}" has no registry entry in lib/diagrams.ts (it would 404 on /diagrams)`);
  }
}

// --- 2) placement liveness: no orphaned figures ------------------------------
for (const e of entries) {
  const real = e.placements.filter((p) => !p.startsWith('/diagrams'));
  if (real.length === 0) {
    errors.push(`diagram "${e.id}" is placed nowhere. A figure nobody renders is dead weight in the sitemap.`);
    continue;
  }
  if (!e.placements.includes(`/diagrams/${e.id}`)) {
    errors.push(`diagram "${e.id}" must list its own permalink /diagrams/${e.id} in placements.`);
  }
  for (const route of real) {
    if (route.startsWith('/guides/')) {
      const slug = route.slice('/guides/'.length);
      const file = `content/guides/${slug}.json`;
      if (!exists(file)) {
        errors.push(`diagram "${e.id}" claims placement ${route}, but ${file} does not exist.`);
      } else if (!read(file).includes(e.id)) {
        errors.push(`diagram "${e.id}" claims placement ${route}, but that guide neither lists it in "figures" nor embeds it as "diagram:${e.id}".`);
      }
      continue;
    }
    const file = route === '/' ? 'app/page.tsx' : `app${route}/page.tsx`;
    if (!exists(file)) {
      errors.push(`diagram "${e.id}" claims placement ${route}, but ${file} does not exist.`);
    } else {
      const src = read(file);
      if (!src.includes(e.id)) {
        errors.push(
          `diagram "${e.id}" claims placement ${route}, but ${file} no longer references it - the page was rewritten and the figure was orphaned.`,
        );
        continue;
      }
      // A reference is not a rendering. /ledger shipped with its figure inside the
      // empty-ledger early return: production always has a ledger, so the branch never ran and
      // the figure never appeared - while this guard passed, because the id was in the file.
      // If a page has several return paths, the figure must appear in the LAST one (the main
      // render); appearing only in an earlier branch is the defect, not a placement.
      // Scope to the PAGE component only. A first cut counted every `return (` in the file and
      // false-positived on /docs, /trust and /methodology, whose helper components (Section,
      // Edge, Dim) each return below the default export.
      const dStart = src.search(/^export default (?:async )?function/m);
      if (dStart !== -1) {
        const after = src.slice(dStart + 1);
        const nextTop = after.search(/^(?:function|const|class|export) /m);
        const body = nextTop === -1 ? after : after.slice(0, nextTop);
        const returns = [...body.matchAll(/^\s*return \(/gm)].map((m) => m.index);
        if (returns.length > 1 && body.indexOf(e.id, returns[returns.length - 1]) === -1) {
          errors.push(
            `diagram "${e.id}" appears in ${file} only BEFORE its final return - it is inside an early-return branch (an empty/error state), so the main render never shows it. Place it in the primary path.`,
          );
        }
      }
    }
  }
}

// --- 3) capability tripwires -------------------------------------------------
// Each assertion below is the thing a figure BAKED IN. When the product changes underneath a
// figure, the matching assertion fails and names the figure that now lies.
const wellKnown = read('app/.well-known/mcp-index.json/route.ts');
const honestLimits = read('lib/honest-limits.ts');
const changeKinds = read('lib/changeKinds.ts');

const TRIPWIRES = {
  'tiers1to3_held_off_by_default_opt_in': () =>
    wellKnown.includes("'tiers1to3_held_off_by_default_opt_in'")
      ? null
      : 'tiers 1-3 are no longer declared held-off in the machine descriptor. The tier-ladder figure still draws them dark: redraw it before shipping the capability.',

  'default-build-egresses-nothing': () =>
    wellKnown.includes("'default_build_egresses_nothing_fail_closed'")
      ? null
      : 'the default build no longer declares zero egress. The trust-boundary figure still says nothing crosses by default: redraw it.',

  'd3-not-graduated': () => {
    const cur = Number((honestLimits.match(/D3_CONFORMING_LABELS = (\d+)/) ?? [])[1]);
    const req = Number((honestLimits.match(/D3_REQUIRED_LABELS = (\d+)/) ?? [])[1]);
    if (!Number.isFinite(cur) || !Number.isFinite(req)) return 'could not read the D3 gate from lib/honest-limits.ts';
    return cur < req
      ? null
      : `D3 has reached its gate (${cur}/${req}). ALLOW becomes producible, so the two-verdict-surfaces figure must stop drawing ALLOW and DENY as reserved.`;
  },

  'surface-taxonomy-size': () => {
    // Count MEMBER LINES, not quote characters: an apostrophe inside an explanatory comment
    // ("...passing silently as 'no change'") is not a taxonomy member.
    const members = (src, name) => {
      const block = (src.match(new RegExp(`${name}[\\s\\S]*?\\]\\)`)) ?? [''])[0];
      return block.split('\n').filter((l) => /^\s*'[a-z-]+',\s*$/.test(l)).length;
    };
    const nS = members(changeKinds, 'SURFACE_CHANGE_KINDS');
    const nR = members(changeKinds, 'SAFETY_RELEVANT_CHANGE_KINDS');
    const nB = members(changeKinds, 'BENIGN_AUTOACCEPT_CHANGE_KINDS');
    const nM = members(changeKinds, 'BEHAVIORAL_MANDATED_CHANGE_KINDS');
    if (nB !== 3 || nM !== 2) {
      return `the gate's posture-input sets changed (${nB} benign auto-accept, ${nM} behaviour-mandated; the posture figure was verified against 3 and 2 by driving the gate on 2026-07-27). Re-run the probe in tasks/diagram-program.md, redraw the figure, then update this tripwire.`;
    }
    // The posture figure is GENERATED from these two sets, so a size change is not an error in
    // itself - it is a prompt to re-read the figure and its twin, which quote both counts.
    // 2026-08-19: nR moved 11 -> 14 when the three server-scoped context-surface kinds
    // (instructions-added, instructions-changed, prompt-args-changed) joined the safety
    // mirror. They live in CONTEXT_SURFACE_CHANGE_KINDS, NOT in SURFACE_CHANGE_KINDS, so
    // POSTURE_ROWS (which iterates the surfaced set only) is unchanged - re-read confirmed
    // the figure renders the same 13 rows.
    return nS === 13 && nR === 14
      ? null
      : `the surfaced taxonomy changed (${nS} surfaced, ${nR} safety-relevant; the posture figure and its text twin were written against 13 and 14). Re-read the figure, then update this tripwire.`;
  },
};

for (const e of entries) {
  if (!e.tripwire) continue;
  const check = TRIPWIRES[e.tripwire];
  if (!check) {
    errors.push(`diagram "${e.id}" declares an unknown tripwire "${e.tripwire}".`);
    continue;
  }
  const failure = check();
  if (failure) errors.push(`TRIPWIRE (${e.id}): ${failure}`);
}

// --- 4) claim vocabulary -----------------------------------------------------
// The cardinal rule: the gate reports a contract-diff, never a safety verdict. A figure is the
// easiest place for that to slip, because a box label has no room for a caveat.
const BANNED = [
  [/\bis safe\b/i, '"is safe"'],
  [/\bproves? (?:it |the tool )?safe\b/i, '"proves safe"'],
  [/\bguarantee[sd]?\b/i, '"guarantee"'],
  [/\bblocks? attacks?\b/i, '"blocks attacks"'],
  [/\bcertif(?:y|ied|ication)\b/i, '"certified"'],
  [/\bmalware\b/i, '"malware"'],
];
const claimText = entries.map((e) => `${e.claim} ${e.alt}`).join('\n');
const diagramSrc = ['gate', 'trust', 'product']
  .map((f) => read(`components/diagrams/${f}.tsx`))
  .join('\n');
for (const [re, label] of BANNED) {
  // "never proves a tool safe" and "it never proves safe" are the honest form: allow a negation
  // immediately before the phrase, reject a bare assertion.
  const haystack = `${claimText}\n${registrySrc}\n${diagramSrc}`;
  for (const m of haystack.matchAll(new RegExp(re.source, 'gi'))) {
    const before = haystack.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    if (/\b(never|not|no|cannot|does not|doesn't|without)\b[^.]*$/.test(before)) continue;
    errors.push(`claim vocabulary: ${label} asserted in a diagram surface ("...${haystack.slice(Math.max(0, m.index - 50), m.index + 30).replace(/\s+/g, ' ')}..."). The gate reports a contract-diff, never a safety verdict.`);
  }
}

// --- 5) contrast floor -------------------------------------------------------
// --color-accent is 3.56:1 on paper and fails AA for text. It is legal as a fill/stroke, and
// legal as TEXT on ink - where it must be named ON_INK_ACCENT so this check can see the intent.
for (const f of ['gate', 'trust', 'product']) {
  const src = read(`components/diagrams/${f}.tsx`);
  src.split('\n').forEach((line, i) => {
    if (!/fill=\{ACCENT\}/.test(line)) return;
    if (/<(M|S|text)\b/.test(line)) {
      errors.push(
        `contrast: components/diagrams/${f}.tsx:${i + 1} uses fill={ACCENT} on a text node (3.56:1 on paper, under the 4.5:1 AA floor). Use ACCENT_TEXT on paper, or ON_INK_ACCENT on an ink ground.`,
      );
    }
  });
}

// --- 6) no fact-shaped literals in a figure ----------------------------------
// Coordinates are numbers, so raw digits cannot be banned. Thousands separators and percentages
// are not coordinates - they are facts, and a fact typed into a figure is a fact that will rot.
for (const f of ['gate', 'trust', 'product']) {
  const src = read(`components/diagrams/${f}.tsx`);
  src.split('\n').forEach((line, i) => {
    const t = line.trimStart();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    // `points="500,188 500,232"` is geometry. Only prose carries thousands separators.
    if (/points=|\bd=\"/.test(line)) return;
    const hit = line.match(/\b\d{1,3},\d{3}\b/) ?? line.match(/\b\d+(?:\.\d+)?%/);
    if (hit) {
      errors.push(
        `hardcoded fact: components/diagrams/${f}.tsx:${i + 1} contains "${hit[0]}". A figure must read changing numbers from their single source (declare it in \`derives\` and pass a prop), never type them.`,
      );
    }
  });
}

// --- 7) every figure carries its text twin -----------------------------------
for (const e of entries) {
  if (!e.claim) errors.push(`diagram "${e.id}" has no claim - the figcaption would be a label, not an argument.`);
  if (!e.alt) errors.push(`diagram "${e.id}" has no alt - it would be invisible to a screen reader and an answer engine.`);
  if (e.alt && e.claim && e.alt.trim() === e.claim.trim()) {
    errors.push(`diagram "${e.id}" reuses its claim as its alt. The alt must describe what the figure shows, in prose.`);
  }
  if (!e.fig) errors.push(`diagram "${e.id}" has no figure number.`);
}
// The twins live as template literals; assert each id's block actually contains one.
for (const e of entries) {
  const block = registrySrc.slice(registrySrc.indexOf(`id: '${e.id}'`));
  const twin = block.slice(0, block.indexOf('\n  },'));
  if (!/twin: (?:[`']|\w+\()/.test(twin)) {
    errors.push(`diagram "${e.id}" has no text twin. That is the artifact an answer engine quotes.`);
  }
}

// --- 8) figure numbers belong to the registry --------------------------------
// components/ArchDiagram.tsx hardcoded "Fig. 01" and shipped onto /docs next to registry
// Fig. 01, so the page rendered two different figures under the same number. Any component
// that owns a <figcaption> and hardcodes a numeric figure label is competing with the series;
// letters (Fig. A) are the escape hatch for a figure outside the registry.
{
  const roots = ['components', 'app'];
  const walk = (dir) => {
    const out = [];
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...walk(rel));
      else if (/\.tsx?$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  for (const f of roots.flatMap(walk)) {
    if (f === 'components/Figure.tsx' || f.startsWith('components/diagrams/')) continue;
    // Comments stripped first: prose EXPLAINING the numbering ("this page renders Fig. 01
    // from the registry above") is not a caption, and flagging it made the guard cry wolf on
    // the very comment documenting the rule.
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (!src.includes('<figcaption')) continue;
    const m = src.match(/Fig\.\s*\d+/);
    if (m) {
      errors.push(
        `figure numbering: ${f} owns a <figcaption> and hardcodes "${m[0]}". The numeric series 01-${String(entries.length).padStart(2, '0')} belongs to lib/diagrams.ts - a hardcoded number collides the moment both render on one page. Use a letter (Fig. A) for a figure outside the registry.`,
      );
    }
  }
}

// --- 9) review staleness (warn, never block) ---------------------------------
const reviewedConst = (registrySrc.match(/const REVIEWED = '([\d-]+)'/) ?? [])[1];
if (reviewedConst) {
  const age = Math.floor((Date.now() - Date.parse(reviewedConst)) / 86_400_000);
  if (age > 180) {
    warnings.push(
      `the diagram set was last reviewed ${age} days ago (${reviewedConst}). Re-read the figures against the product and bump REVIEWED in lib/diagrams.ts.`,
    );
  }
}

// --- report ------------------------------------------------------------------
for (const w of warnings) console.warn(`  warn  ${w}`);

if (errors.length) {
  console.error(`\ndiagram freshness guard FAILED (${errors.length}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nA stale diagram is a false claim with a picture around it. Fix, then rebuild.\n');
  process.exit(1);
}

console.log(
  `diagram freshness guard OK - ${entries.length} figures, ${entries.filter((e) => e.tripwire).length} capability tripwires armed, ${entries.filter((e) => e.derives.length).length} deriving live facts.`,
);
