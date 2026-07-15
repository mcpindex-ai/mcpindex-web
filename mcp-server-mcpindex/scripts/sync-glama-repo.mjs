// Mirror this package's source to the Glama-bound standalone repo
// (mcpindex-ai/mcp-server-mcpindex).
//
// WHY THIS EXISTS: Glama permanently binds a server listing to one repository -
// the admin "Repository" field is immutable after the server is created, and it
// is locked to the standalone `mcpindex-ai/mcp-server-mcpindex`. Glama's
// Maintenance grade reads that repo's commit + release activity, so it must stay
// unarchived and receive a commit each release or the grade decays back toward F.
//
// Development lives in the mcpindex-web monorepo (single source of truth). This
// script keeps the standalone a faithful, hands-off mirror so the monorepo stays
// canonical while Glama still sees fresh activity. Run standalone to backfill, or
// automatically as release.mjs step 7.
//
// Idempotent: clones the mirror, rsyncs the package tree in, and pushes ONLY when
// something actually changed (no empty commits). Auth uses the machine's existing
// git credential helper (same path we push the monorepo with). Requires the
// mirror repo to be UNARCHIVED - a rejected push almost always means it was
// re-archived, which would also tank the Maintenance grade.

import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIRROR_REPO = 'https://github.com/mcpindex-ai/mcp-server-mcpindex.git';
const MIRROR_SLUG = 'mcpindex-ai/mcp-server-mcpindex';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { name, version } = JSON.parse(
  await readFile(path.join(pkgRoot, 'package.json'), 'utf8'),
);

const tmp = mkdtempSync(path.join(tmpdir(), 'mcpindex-mirror-'));
const clone = path.join(tmp, 'repo');
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const capture = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8' });

try {
  console.log(`sync-glama-repo: mirroring ${name}@${version} -> ${MIRROR_SLUG}`);
  run('git', ['clone', '--depth', '1', MIRROR_REPO, clone], tmp);

  // Faithful mirror of the package tree; --delete drops files that no longer
  // exist in source. .git and node_modules are the only things we must not touch.
  run(
    'rsync',
    ['-a', '--delete', '--exclude', '.git', '--exclude', 'node_modules',
      `${pkgRoot}/`, `${clone}/`],
    tmp,
  );

  if (!capture('git', ['status', '--porcelain'], clone).trim()) {
    console.log('sync-glama-repo: mirror already current, nothing to push.');
    process.exit(0);
  }

  run('git', ['add', '-A'], clone);
  run('git', ['commit', '-m', `sync: ${name}@${version} from mcpindex-web`], clone);
  run('git', ['push', 'origin', 'HEAD'], clone);
  console.log(`sync-glama-repo: pushed mirror commit for ${version}.`);
} catch (err) {
  console.error(`sync-glama-repo: FAILED - ${err.message}`);
  console.error(
    'If the push was rejected, confirm the mirror repo is UNARCHIVED (Glama needs it live).',
  );
  process.exit(1);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
