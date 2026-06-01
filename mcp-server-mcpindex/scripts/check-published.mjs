// Drift guard: compare this package's in-tree version against what is live on
// npm. Exits non-zero when they disagree, so CI (or a pre-push hook) fails loudly
// instead of letting the source silently drift ahead of the published artifact -
// the failure mode that left the old standalone repo stuck at 0.1.0.
//
// No deps, no auth: reads the public npm registry over HTTPS.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function cmp(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

const { name, version: local } = JSON.parse(
  await readFile(path.join(pkgRoot, 'package.json'), 'utf8'),
);

let published = null;
try {
  const res = await fetch(`https://registry.npmjs.org/${name}/latest`, {
    headers: { accept: 'application/json' },
  });
  if (res.ok) published = (await res.json()).version;
} catch {
  // Network failure is not a drift signal - do not fail the build on it.
}

if (published === null) {
  console.warn(`check-published: could not reach npm registry; skipping (local ${local}).`);
  process.exit(0);
}

const order = cmp(local, published);
if (order === 0) {
  console.log(`check-published: OK - ${name}@${local} matches npm.`);
  process.exit(0);
}
if (order > 0) {
  console.error(
    `check-published: DRIFT - in-tree ${name}@${local} is AHEAD of npm@${published}. ` +
      `Run \`npm run release\` to publish, or revert the version bump.`,
  );
  process.exit(1);
}
console.error(
  `check-published: DRIFT - npm@${published} is AHEAD of in-tree ${local}. ` +
    `The working copy is stale; pull the latest source.`,
);
process.exit(1);
