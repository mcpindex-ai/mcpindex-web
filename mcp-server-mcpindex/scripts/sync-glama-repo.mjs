// Mirror this package's COMMITTED source to the Glama-bound standalone repo
// (mcpindex-ai/mcp-server-mcpindex).
//
// WHY THIS EXISTS: Glama permanently binds a server listing to one repository -
// the admin "Repository" field is immutable after the server is created, and it
// is locked to the standalone `mcpindex-ai/mcp-server-mcpindex`. Glama's
// Maintenance grade reads that repo's commit + release activity, so it must stay
// unarchived and receive a commit each release or the grade decays back toward F.
//
// Development lives in the mcpindex-web monorepo (single source of truth). This
// script keeps the standalone a faithful, hands-off mirror of the *committed*
// package tree.
//
// SECURITY: the mirror is built from `git archive HEAD:<subdir>`, i.e. only files
// TRACKED and committed in the monorepo (which respects the monorepo .gitignore).
// An untracked or gitignored file - .env, .npmrc, a key, a built .mcpb - is not in
// HEAD and therefore can NEVER be pushed to the public mirror. This replaces an
// earlier rsync-of-the-live-dir that used a fragile denylist. Idempotent: pushes
// only when the mirror actually differs. Auth uses the machine's git credential
// helper (same path the monorepo pushes with). A rejected push almost always means
// the mirror was re-archived (Glama needs it live) or has diverged.

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIRROR_REPO = 'https://github.com/mcpindex-ai/mcp-server-mcpindex.git';
const MIRROR_SLUG = 'mcpindex-ai/mcp-server-mcpindex';
// This package's path within the monorepo (the tree `git archive` exports).
const SUBDIR = 'mcp-server-mcpindex';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { name, version } = JSON.parse(
  await readFile(path.join(pkgRoot, 'package.json'), 'utf8'),
);

const tmp = mkdtempSync(path.join(tmpdir(), 'mcpindex-mirror-'));
const clone = path.join(tmp, 'repo');
const exportDir = path.join(tmp, 'export');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const capture = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8' });

try {
  console.log(`sync-glama-repo: mirroring committed ${name}@${version} -> ${MIRROR_SLUG}`);
  run('git', ['clone', '--depth', '1', MIRROR_REPO, clone], tmp);

  // Export ONLY the committed package tree at HEAD into a clean dir. `git archive`
  // emits just tracked files, so gitignored/untracked files can never be mirrored.
  // NOTE: `HEAD:<path>` is resolved relative to the CWD-within-the-repo, so this
  // MUST run from the repo root - from pkgRoot git would look for
  // `<subdir>/<subdir>` and emit an EMPTY archive, which the --delete below would
  // then use to wipe the entire mirror.
  mkdirSync(exportDir);
  const repoRoot = capture('git', ['rev-parse', '--show-toplevel'], pkgRoot).trim();
  const archive = execFileSync('git', ['archive', `HEAD:${SUBDIR}`], {
    cwd: repoRoot,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync('tar', ['-x', '-f', '-', '-C', exportDir], { input: archive });

  // Safety net: never let an empty/partial export drive `rsync --delete` - that
  // would blow away the whole mirror. Abort loudly if the export came out empty.
  if (readdirSync(exportDir).length === 0) {
    throw new Error('git archive produced no files; refusing to wipe the mirror');
  }

  // Sync the clean export into the clone; --delete keeps the mirror faithful
  // (handles files removed from source). .git is the only thing we must not touch.
  run('rsync', ['-a', '--delete', '--exclude', '.git', `${exportDir}/`, `${clone}/`], tmp);

  if (!capture('git', ['status', '--porcelain'], clone).trim()) {
    console.log('sync-glama-repo: mirror already current, nothing to push.');
  } else {
    run('git', ['add', '-A'], clone);
    run('git', ['commit', '-m', `sync: ${name}@${version} from mcpindex-web`], clone);
    run('git', ['push', 'origin', 'HEAD'], clone);
    console.log(`sync-glama-repo: pushed mirror commit for ${version}.`);
  }
} catch (err) {
  console.error(`sync-glama-repo: FAILED - ${err.message}`);
  console.error(
    'Check: mirror repo UNARCHIVED (Glama needs it live), no non-fast-forward divergence, git identity configured.',
  );
  process.exitCode = 1;
} finally {
  // Always runs (no process.exit above), so the temp clone is never leaked.
  rmSync(tmp, { recursive: true, force: true });
}
