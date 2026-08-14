// Identity gate for generated per-server connect guides. Runs on pull requests and fails the PR
// that adds or edits a guide whose SEO metadata never names the server it is about.
//
// WHY THIS EXISTS
// PR #92 merged five machine-generated connect guides. One of them named its server in none of
// its metadata - h1 "Connect to MCP Server", meta_description "Connect to MCP server" - while its
// body was correct and server-specific. In review it looked exactly like its four good siblings.
// These files arrive as artifacts from a generator and are merged by hand, and nothing here read
// them, so the only thing standing between a placeholder page and production was whether someone
// happened to diff four metadata fields across five near-identical JSON files. The rule itself
// lives in lib/guideSeo.ts, with the reasoning behind each field.
//
// SCOPE: THE GUIDES THIS CHANGE TOUCHES, NOT THE TREE
// Mirrors check-guide-freshness.mjs - you fix what you break, never someone else's backlog. It
// is also what lets the rule stay honest with no baseline file and no allowlist to rot: a
// pre-existing weak page is simply not graded until someone edits it. A gate that fails PRs over
// pages their author never opened is the "red by default" monitor that the freshness rewrite
// just finished curing, and it would be retired the same way.
//
// Exit 0 = no graded guide in this change, or all of them name their server. Exit 1 = a named
// guide, a named field, and the value that is wrong.

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  CONNECT_GUIDE_SUFFIX,
  GRADED_FIELDS,
  gradeConnectGuideIdentity,
  isConnectGuideSlug,
} from '../lib/guideSeo';

/** A PR run that cannot resolve its own change set must fail, never print "ok" - see below. */
const IS_PULL_REQUEST = process.env.GITHUB_EVENT_NAME === 'pull_request';

const GUIDES_DIR = 'content/guides';
const SLUGMAP = 'data/slugmap.json';

/**
 * `ok` distinguishes "the command failed" from "the command printed nothing" - collapsing the two
 * is how a gate reports a pass over an empty change set it never actually computed. A failed
 * `git diff` (no merge base under a shallow clone, say) must reach the null-change-set path, not
 * coerce to zero touched files.
 */
function git(...args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync('git', args, { encoding: 'utf8' }).trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

/** slug -> registry id, inverted from the snapshot the site already ships. Absent file or a slug
 *  newer than the snapshot yields null, and the grader falls back to guessing from the slug. */
function loadRegistryIds(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(SLUGMAP)) return out;
  try {
    const parsed = JSON.parse(readFileSync(SLUGMAP, 'utf8')) as { servers?: Record<string, string> };
    for (const [id, slug] of Object.entries(parsed.servers ?? {})) out.set(slug, id);
  } catch {
    // A malformed slugmap is another gate's problem; grading falls back to the slug.
  }
  return out;
}

/**
 * Paths this change adds or modifies, or null when there is nothing to compare against.
 *
 * Deliberately NOT shared with check-guide-freshness.mjs, and the copies are ALREADY not
 * identical: this one drops files deleted by the PR (`status !== 'removed'`, `--diff-filter=d`)
 * because a deleted guide has nothing left to read, and it hard-fails on a truncated listing.
 * That is the correct behaviour and the sibling lacks it, which is the honest argument for
 * extracting a shared module the next time either file is opened - the blocker is only that
 * freshness is `.mjs` and additionally needs commit dates, so a shared module has to serve both.
 * TODO(2026-08-13): extract once check-guide-freshness.mjs is not being edited elsewhere.
 *
 * The constraint driving the shape is the same and is documented there: this repo's .git is
 * 1.2GB, so `fetch-depth: 0` on every PR is not a trade worth making, and on a PR run the
 * GitHub API is authoritative and costs no clone depth. The local git path exists so the gate
 * can be run and tested by hand before it is ever pushed.
 */
async function changedPaths(): Promise<{ files: string[]; source: string } | null> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (token && repo && eventPath && existsSync(eventPath)) {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const number = event?.pull_request?.number;
    if (!number) return null; // not a PR run: nothing to gate
    const files: string[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'mcpindex-web-ci',
          },
        },
      );
      if (!res.ok) throw new Error(`GitHub API files returned ${res.status}`);
      const rows: Array<{ filename: string; status: string }> = await res.json();
      // A guide deleted in this PR has nothing left to grade and no file to read.
      files.push(...rows.filter((r) => r.status !== 'removed').map((r) => r.filename));
      if (rows.length < 100) break;
      // Ten full pages means there may be more files than this loop can see. Silently grading the
      // first 1000 would print "ok" over guides nobody looked at, which is the one thing this
      // gate must never do. (Exactly 1000 is indistinguishable from 1000+ without another call,
      // so this errs closed on the boundary.)
      if (page === 10) throw new Error('PR has 1000+ files; change-set listing may be truncated');
    }
    return { files, source: `PR #${number}` };
  }

  const base = process.env.GUIDE_SEO_BASE || 'origin/main';
  // `--` keeps a base beginning with '-' from being read as a git option.
  if (!git('rev-parse', '--verify', '--quiet', `${base}^{commit}`, '--').ok) return null;
  const diff = git('diff', '--name-only', '--diff-filter=d', `${base}...HEAD`, '--');
  if (!diff.ok) return null; // e.g. no merge base under a shallow clone: unknown, not empty
  const files = diff.out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return { files, source: `${base}...HEAD` };
}

let change: { files: string[]; source: string } | null;
try {
  change = await changedPaths();
} catch (err) {
  // Fail closed, but legibly. This gate sits inside the one REQUIRED check, so an unhandled
  // rejection reads as a mystery CI failure on an unrelated PR; a named cause tells the next
  // person it is the API, not their diff, and that a re-run may fix it.
  console.error(`GUIDE SEO: could not read the change set - ${(err as Error).message}`);
  console.error('Re-run the job. If it persists, the GitHub API call above is the thing to look at.');
  process.exit(1);
}

// A PR run that could not resolve a change set has graded nothing. Printing "ok" there would
// disarm the gate silently - and the only thing arming it is the `env:` block on the workflow
// step, which its three neighbours do not have, so a future tidy-up of that stanza would switch
// this off with no signal anywhere. lib/guideSeo.ts states the rule this honors: a check that
// cannot check must never report a pass. Locally (no GITHUB_EVENT_NAME) a missing base is just
// someone running the script by hand, and stays quiet.
if (IS_PULL_REQUEST && change === null) {
  console.error('GUIDE SEO: running on a pull request but could not resolve the changed files.');
  console.error(
    'Nothing was graded, so this cannot report a pass. Usual cause: the GITHUB_TOKEN env is\n' +
      'missing from this workflow step (the API path needs it; the git fallback cannot work\n' +
      'under actions/checkout@v4 default fetch-depth: 1).',
  );
  process.exit(1);
}

const touched = (change?.files ?? []).filter(
  (f) => f.startsWith(`${GUIDES_DIR}/`) && f.endsWith('.json'),
);

interface Problem {
  slug: string;
  rel: string;
  reason: 'ungradeable' | 'identity' | 'owner';
  owner: string | null;
  ownerIsGuess: boolean;
  ownerMentions: number;
  ownerRequired: number;
  tokens: string[];
  failures: { field: string; value: string }[];
}

const registryIds = loadRegistryIds();
const problems: Problem[] = [];

for (const rel of touched) {
  if (!existsSync(rel)) continue; // renamed away under us; nothing to grade

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(rel, 'utf8'));
  } catch {
    continue; // a malformed guide is the loader's problem, not this gate's
  }
  // Shape, not just syntax. A file containing `null` parses cleanly and then throws a raw stack
  // trace out of the grader - the "mystery CI failure on an unrelated PR" this file is built to
  // avoid. (`[]` never threw; property access on an array is just undefined. It is skipped here
  // for the same reason the renderer drops it: it is not a guide.) lib/guides-content.ts
  // coerceGuide guards the null case the same way; the Array test is ours.
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
  const guide = parsed as Record<string, unknown>;

  // The renderer resolves identity as the in-file `slug` first, falling back to the filename, and
  // drops the guide entirely if that slug fails SLUG_RE (lib/guides-content.ts coerceGuide).
  // Grade exactly what the site will publish, so the gate and the renderer cannot disagree in
  // either direction - including not failing a PR over a page that would never ship.
  const inFile = typeof guide.slug === 'string' ? guide.slug : '';
  const slug = inFile || path.basename(rel, '.json');
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) continue; // SLUG_RE, lib/guides-content.ts:83
  if (!isConnectGuideSlug(slug)) continue; // topical guide: carries no server identity by design

  // slugmap is keyed by SERVER slug; a guide slug is that plus the connect suffix. Looking up
  // the guide slug silently misses every time and quietly demotes the rule to the slug guess -
  // which is exactly the positional heuristic this was written to stop relying on.
  const serverSlug = slug.slice(0, -CONNECT_GUIDE_SUFFIX.length);
  const grade = gradeConnectGuideIdentity(slug, guide, registryIds.get(serverSlug) ?? null);
  const common = {
    slug,
    rel,
    owner: grade.owner,
    ownerIsGuess: grade.ownerIsGuess,
    ownerMentions: grade.ownerMentions,
    ownerRequired: grade.ownerRequired,
    tokens: grade.tokens,
  };
  if (!grade.gradeable) {
    problems.push({ ...common, reason: 'ungradeable', failures: [] });
    continue;
  }
  if (grade.failures.length) {
    problems.push({ ...common, reason: 'identity', failures: grade.failures });
    continue;
  }
  if (grade.ownerMissing) {
    problems.push({ ...common, reason: 'owner', failures: [] });
  }
}

if (problems.length) {
  console.error('GUIDE SEO: a connect guide does not name the server it is about.\n');
  for (const p of problems) {
    if (p.reason === 'ungradeable') {
      console.error(`  ${p.slug}`);
      console.error(
        `    this slug is entirely vendor boilerplate - every segment is a stopword, so there is\n` +
          `    no server identity in it to verify anything against. That points at the generator\n` +
          `    or the registry id, not at the prose: ${p.rel} is named after no particular server.\n` +
          `    Failing rather than passing, because a check that cannot check must not report a pass.`,
      );
      continue;
    }
    if (p.reason === 'owner') {
      const shared = p.tokens.filter((t) => t !== p.owner);
      console.error(`  ${p.slug}`);
      console.error(
        `    names the publisher "${p.owner}" in ${p.ownerMentions} of ${p.ownerRequired} required field(s).`,
      );
      if (shared.length) {
        console.error(
          `    Other servers share "${shared.join('", "')}", so that alone does not say which\n` +
            `    server this page is about.`,
        );
      }
      console.error(
        `    Name "${p.owner}" in at least ${p.ownerRequired} of ${GRADED_FIELDS.join(', ')}` +
          `${p.ownerIsGuess ? ' (publisher inferred from the slug; not in the registry snapshot)' : ''}.`,
      );
      console.error(`    -> ${p.rel}`);
      continue;
    }
    console.error(`  ${p.slug}   (must mention: ${p.tokens.join(' or ')})`);
    for (const f of p.failures) {
      console.error(`    ${f.field}: ${f.value === '' ? '(missing or blank)' : JSON.stringify(f.value)}`);
    }
    console.error(`    -> ${p.rel}`);
  }
  console.error(
    `\nRewrite the named field(s) to say which server this is. These are the fields a search\n` +
      `result shows and the first line the reader sees; generic copy here makes a page that ranks\n` +
      `for nothing and, if it does rank, does not tell the reader which server they are\n` +
      `installing. Graded: ${GRADED_FIELDS.join(', ')}. "title" is not graded.`,
  );
  process.exit(1);
}

const scope = change
  ? `${touched.length} touched guide file(s) in ${change.source}`
  : 'no base to compare';
console.log(`guide seo ok: ${scope}`);
