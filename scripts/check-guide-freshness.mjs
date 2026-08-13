// Walkthrough-guide freshness gate. Runs on pull requests, and fails the PR that lets a
// guide fall behind the code it documents - at the moment the coupling breaks, not days later.
//
// WHY THIS EXISTS
// Each guide in content/guides/ declares two things: an `updated` stamp (a human saying "I
// re-read this") and a `depends_on` list (the files whose behaviour the prose describes). A
// healthcheck probe, mcpindex-docs-freshness, compares them on origin/main and nudges when a
// dependency moved after the stamp.
//
// That probe was failing 194 of 268 runs - 72% - for weeks. Not one of those failures was
// wrong. Every one was a dependency edited in a commit that did not re-stamp the guide, because
// nothing made the two travel together. A monitor that is red by default is not a monitor; it
// is a permanently lit warning lamp that everyone has learned to walk past. Meanwhile a guide
// that HAD genuinely rotted would look exactly the same as the background noise.
//
// The most recent instance is the shape of all of them. 4e3e83c added `param-mirrored-to-header`
// to lib/changeKinds.ts. c04308d, five minutes later, correctly rewrote the sentence in
// why-your-mcp-scan-has-no-green-checkmarks that quotes those counts - and left `updated` at
// 2026-08-08. The prose was current; the stamp said otherwise; the probe was red for a day. The
// author did the hard part and skipped the bookkeeping, which is exactly the kind of thing a
// build should do for you rather than nag about.
//
// WHAT IT ENFORCES
//   1. Every path in a `depends_on` list must exist. A renamed dependency is invisible to the
//      probe - it simply has no history at the new path and gets skipped - so a guide can stop
//      being graded at all without anyone noticing. Checked on every run.
//   2. If this change touches a file some guide depends on, that guide's `updated` must be
//      at least the date of this change. Checked only for the guides this change actually
//      affects: you fix what you break, never someone else's backlog.
//
// The escape hatch is deliberate and visible: bump `updated` without editing prose. That is a
// person asserting they re-read the guide and it still holds, which is a real answer. Silence
// is not.
//
// Exit 0 = nothing to enforce here, or all affected guides re-stamped. Exit 1 = a named guide
// needs a re-read.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const GUIDES_DIR = 'content/guides';

function loadGuides() {
  return readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const rel = path.join(GUIDES_DIR, f);
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(rel, 'utf8'));
      } catch {
        return null; // a malformed guide is the loader's problem, not this gate's
      }
      return { slug: f.replace(/\.json$/, ''), rel, guide: parsed };
    })
    .filter(Boolean);
}

function git(...args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * The changed paths and the date they carry, or null when there is nothing to compare.
 *
 * Two sources, same answer. On a pull_request run the GitHub API is authoritative and costs no
 * clone depth - this repo's .git is 1.2GB, so `fetch-depth: 0` on every PR is not a trade worth
 * making. Locally it falls back to git against a base ref so the gate can be run and tested by
 * hand before it is ever pushed.
 *
 * The API reports commit dates in UTC while the probe reads `%cI` (committer-local). For a
 * negative UTC offset the UTC date is the same day or one later, so the API path can only ever
 * ask for a stamp that is equal or newer than what the probe will demand. Stricter, never looser
 * - the direction that cannot produce a green PR followed by a red monitor.
 */
async function changeSet() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (token && repo && eventPath && existsSync(eventPath)) {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const number = event?.pull_request?.number;
    if (!number) return null; // not a PR run: nothing to gate
    const api = async (suffix) => {
      const out = [];
      for (let page = 1; page <= 10; page++) {
        const res = await fetch(
          `https://api.github.com/repos/${repo}/pulls/${number}/${suffix}?per_page=100&page=${page}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github+json',
              'User-Agent': 'mcpindex-web-ci',
            },
          },
        );
        if (!res.ok) throw new Error(`GitHub API ${suffix} returned ${res.status}`);
        const rows = await res.json();
        out.push(...rows);
        if (rows.length < 100) break;
      }
      return out;
    };
    const files = (await api('files')).map((f) => f.filename);
    const dates = (await api('commits'))
      .map((c) => c?.commit?.committer?.date || c?.commit?.author?.date)
      .filter(Boolean)
      .map((d) => d.slice(0, 10));
    return { files, date: dates.sort().at(-1), source: `PR #${number}` };
  }

  const base = process.env.GUIDE_FRESHNESS_BASE || 'origin/main';
  if (!git('rev-parse', '--verify', '--quiet', `${base}^{commit}`)) return null;
  const files = (git('diff', '--name-only', `${base}...HEAD`) || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const dates = (git('log', '--format=%cI', `${base}..HEAD`) || '')
    .split('\n')
    .map((s) => s.trim().slice(0, 10))
    .filter(Boolean);
  return { files, date: dates.sort().at(-1), source: `${base}...HEAD` };
}

function checkDepsExist(guides) {
  const missing = [];
  for (const { slug, guide } of guides) {
    for (const dep of guide.depends_on || []) {
      if (typeof dep === 'string' && !existsSync(dep)) missing.push({ slug, dep });
    }
  }
  return missing;
}

function checkStamps(guides, change) {
  if (!change?.date || !change.files.length) return [];
  const touched = new Set(change.files);
  const stale = [];
  for (const { slug, rel, guide } of guides) {
    const deps = (guide.depends_on || []).filter((d) => typeof d === 'string' && touched.has(d));
    if (!deps.length) continue;
    const updated = typeof guide.updated === 'string' ? guide.updated.slice(0, 10) : '';
    if (!updated) {
      stale.push({ slug, rel, deps, updated: '(none)', required: change.date });
      continue;
    }
    if (updated < change.date) stale.push({ slug, rel, deps, updated, required: change.date });
  }
  return stale;
}

const guides = loadGuides();
const graded = guides.filter((g) => Array.isArray(g.guide.depends_on) && g.guide.depends_on.length);

const missing = checkDepsExist(graded);
if (missing.length) {
  console.error('GUIDE FRESHNESS: a declared dependency does not exist.\n');
  console.error(
    'A `depends_on` path that has been renamed or deleted has no history at that path, so the\n' +
      'freshness probe silently stops grading that guide. Point it at the new file, or drop it.\n',
  );
  for (const { slug, dep } of missing) console.error(`  ${slug}: missing ${dep}`);
  process.exit(1);
}

let change;
try {
  change = await changeSet();
} catch (err) {
  // Fail closed, but legibly. This gate sits inside the one REQUIRED check, so an
  // unhandled rejection here reads as a mystery CI failure on an unrelated PR; a named
  // cause tells the next person it is the API, not their diff, and that a re-run may fix it.
  console.error(`GUIDE FRESHNESS: could not read the change set - ${err.message}`);
  console.error('Re-run the job. If it persists, the GitHub API call above is the thing to look at.');
  process.exit(1);
}
const stale = checkStamps(graded, change);

if (stale.length) {
  console.error('GUIDE FRESHNESS: this change edits code a guide documents.\n');
  for (const { slug, rel, deps, updated, required } of stale) {
    console.error(`  ${slug}`);
    console.error(`    touched: ${deps.join(', ')}`);
    console.error(`    "updated": "${updated}" -> needs "${required}" (or later) in ${rel}`);
  }
  console.error(
    '\nRe-read the guide against what you changed, fix the prose if it now says something\n' +
      'untrue, and set `updated`. If the prose still holds, bump the stamp anyway - that is you\n' +
      'saying so, and it is what keeps mcpindex-docs-freshness meaningful instead of always red.',
  );
  process.exit(1);
}

const scope = change ? `${change.files.length} changed path(s) in ${change.source}` : 'no base to compare';
console.log(`guide freshness ok: ${graded.length} graded guide(s), ${scope}`);
