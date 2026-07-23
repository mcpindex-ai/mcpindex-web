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

// manifest.json is committed + mirrored to the Glama repo and built into the .mcpb;
// keep its version in lockstep with package.json so no artifact ships a stale one.
const manifest = JSON.parse(await readFile(path.join(pkgRoot, 'manifest.json'), 'utf8'));
if (manifest.version !== version) {
  console.error(
    `release: ABORT - manifest.json version (${manifest.version}) != package.json (${version}). Bump manifest.json.`,
  );
  process.exit(1);
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

console.log(`release: done - published ${name}@${version} and pushed tag ${tag}.`);
