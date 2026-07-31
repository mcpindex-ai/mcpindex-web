// One-command release. Replaces the by-hand "edit, maybe bump, maybe publish"
// ritual that let the published artifact drift from source. Run from the package
// directory after you have bumped `version` in package.json and added the matching
// CHANGELOG entry:
//
//   npm run release
//
// Steps (any failure aborts before publishing):
//   1. syntax-check both entry files
//   2. run the test suite
//   3. assert CHANGELOG.md has a heading for the current version
//   4. assert the version is not already on npm (no accidental re-publish)
//   5. npm publish
//   6. git tag pkg-v<version> and push the tag
//   7. mirror source to the Glama-bound standalone repo (best-effort)
//   8. publish server.json to the MCP registry (best-effort)
//
// No auto-bump on purpose: the version + CHANGELOG entry are an explicit,
// reviewable commit; this script only gates and ships what is already committed.

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: pkgRoot, stdio: 'inherit' });
const capture = (cmd, args) =>
  execFileSync(cmd, args, { cwd: pkgRoot, encoding: 'utf8' });

const { name, version } = JSON.parse(
  await readFile(path.join(pkgRoot, 'package.json'), 'utf8'),
);
console.log(`release: preparing ${name}@${version}`);

// Guard: refuse to release with uncommitted changes in the package dir. The header
// promises the version is "already committed", but nothing enforced it - so
// `npm publish` (working tree) would ship the bump while the Glama mirror
// (`git archive HEAD:`, step 7) shipped the old version, silently. That is the
// split that left the mirror on 0.3.10 while npm went to 0.3.11.
const dirty = capture('git', ['status', '--porcelain', '--', '.']).trim();
if (dirty) {
  console.error(
    `release: ABORT - uncommitted changes in ${name}. npm ships the working tree but the\n` +
      `Glama mirror ships HEAD, so releasing dirty desyncs them. Commit first:\n${dirty}`,
  );
  process.exit(1);
}

// Every sibling file that repeats the version must move with package.json, or some
// artifact ships a stale one. This was a manifest.json-only check, so the two files it
// did NOT cover drifted exactly as you would predict: package-lock.json sat at 0.3.8
// while package.json reached 0.3.12 (harmless - `files` excludes it from the tarball and
// `npm ci` only diffs dependencies - but it makes the lock lie about what it locks), and
// server.json, the MCP registry descriptor, was unguarded while carrying the version
// TWICE. A registry descriptor that advertises a version npm does not have is the same
// published-drift failure this script exists to prevent, so the check is now over the set
// rather than over one file anyone remembered to add.
const VERSION_SIBLINGS = [
  { file: 'manifest.json', paths: [['version']] },
  { file: 'server.json', paths: [['version'], ['packages', 0, 'version']] },
  { file: 'package-lock.json', paths: [['version'], ['packages', '', 'version']] },
];
for (const { file, paths } of VERSION_SIBLINGS) {
  const doc = JSON.parse(await readFile(path.join(pkgRoot, file), 'utf8'));
  for (const keys of paths) {
    // Reduce rather than index: a missing intermediate must read as undefined and FAIL the
    // comparison, not throw a TypeError that reads like a broken release script.
    const found = keys.reduce((node, k) => (node == null ? undefined : node[k]), doc);
    if (found !== version) {
      // The lockfile's root entry is keyed by the EMPTY STRING, which a bare join swallows
      // into "packages..version" and sends the reader hunting for a field that looks
      // malformed. Render it as '' so the path is copy-pasteable.
      const where = keys.map((k) => (k === '' ? "''" : k)).join('.');
      console.error(
        `release: ABORT - ${file} ${where} (${found}) != package.json (${version}). ` +
          `Bump ${file}.`,
      );
      process.exit(1);
    }
  }
}

// 1 + 2: build (syntax) and tests
run('npm', ['run', 'build']);
run('npm', ['test']);

// 3: CHANGELOG must document this version
const changelog = await readFile(path.join(pkgRoot, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${version}]`)) {
  console.error(`release: ABORT - CHANGELOG.md has no "## [${version}]" entry.`);
  process.exit(1);
}

// 4: refuse to re-publish an existing version
let published = null;
try {
  const res = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  if (res.ok) published = version;
} catch {
  // ignore network errors - npm publish will fail later if truly unreachable
}
if (published) {
  console.error(`release: ABORT - ${name}@${version} is already on npm. Bump the version first.`);
  process.exit(1);
}

// 5: publish (requires `npm login`)
run('npm', ['publish', '--access', 'public']);

// 6: tag + push
const tag = `pkg-v${version}`;
run('git', ['tag', tag]);
run('git', ['push', 'origin', tag]);

// 7: mirror source to the Glama-bound standalone repo so its Maintenance grade
// stays fresh (see scripts/sync-glama-repo.mjs for why the mirror exists).
// Best-effort: npm has already published, so a mirror failure must not fail the
// release - it just needs a manual re-run.
try {
  run('node', ['scripts/sync-glama-repo.mjs']);
} catch {
  console.error(
    'release: WARNING - published to npm but the Glama mirror push failed. ' +
      'Re-run `npm run sync-glama` (check the standalone repo is unarchived).',
  );
}

// 8: publish server.json to the MCP registry. Until 2026-07-31 this was a separate
// manual ritual, so it simply got skipped: npm reached 0.3.13 while the registry sat on
// 0.3.11, published 2026-07-16. Two releases of stale metadata on the official registry
// is a bad look for a product whose thesis is that registry metadata goes stale.
//
// Auth is non-interactive when `gh` is logged in - `mcp-publisher login github -token`
// takes a PAT, so no device-code prompt in the middle of a release. Same best-effort
// contract as the Glama mirror above: npm has already published and the tag is pushed, so
// a registry failure must not fail the release. `mcpindex-registry-version-drift` in
// tools/healthcheck catches it within ~10 min if this step is skipped or silently fails.
//
// ACCEPTED EXPOSURE: mcp-publisher takes the token as an argv flag, so it is visible in
// `ps` for the ~1s the login runs. Single-user workstation, short-lived `gho_` token, and
// the documented manual fallback has the identical shape - but if this ever runs on a
// shared or multi-tenant host, switch to the interactive `mcp-publisher login github`
// device flow, which never puts the credential on a command line.
try {
  const ghToken = capture('gh', ['auth', 'token']).trim();
  if (!ghToken) throw new Error('gh auth token returned empty');
  run('mcp-publisher', ['login', 'github', '-token', ghToken]);
  run('mcp-publisher', ['publish']);
} catch {
  // Never echo the token or the underlying error text - execFileSync error objects
  // carry the full argv, which includes the PAT.
  console.error(
    'release: WARNING - published to npm but the MCP registry publish failed. ' +
      'Re-run by hand from this directory:\n' +
      '  mcp-publisher login github -token "$(gh auth token)" && mcp-publisher publish\n' +
      '(needs `gh auth login` and `brew install mcp-publisher`).',
  );
}

console.log(`release: done - published ${name}@${version} and pushed tag ${tag}.`);
