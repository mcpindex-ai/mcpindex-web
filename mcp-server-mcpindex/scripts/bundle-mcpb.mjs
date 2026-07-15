// Build a distributable .mcpb bundle (MCP Bundle) for Smithery and other
// MCPB-aware hosts. Self-contained: copies the package to a temp dir, installs
// prod-only deps, syncs the manifest version to package.json so the artifact can
// never drift from what npm shipped, then packs + minimizes via @anthropic-ai/mcpb.
//
//   npm run bundle
//
// Output: <pkgRoot>/mcp-server-mcpindex-<version>.mcpb (a gitignored build artifact).
// Publish to Smithery (after `npx -y @smithery/cli auth login`):
//   npx -y @smithery/cli mcp publish ./mcp-server-mcpindex-<version>.mcpb -n mcpindex-ai/mcp-server-mcpindex
//
// The manifest.json committed alongside is the source of truth for the bundle
// metadata (tools, entry point, user_config); only `version` is overwritten here.

import { readFile, writeFile, rm, mkdtemp, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { name, version } = JSON.parse(
  await readFile(path.join(pkgRoot, 'package.json'), 'utf8'),
);

const tmp = await mkdtemp(path.join(tmpdir(), 'mcpb-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

try {
  // Copy sources only (never node_modules or a previously-built artifact).
  for (const f of ['src', 'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'manifest.json']) {
    await cp(path.join(pkgRoot, f), path.join(tmp, f), { recursive: true });
  }

  // Pin the manifest version to the package version so the two never drift.
  const manifestPath = path.join(tmp, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.version = version;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  // Bundle the runtime deps so the .mcpb runs without a network install.
  run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], tmp);

  const out = path.join(pkgRoot, `${name}-${version}.mcpb`);
  run('npx', ['-y', '@anthropic-ai/mcpb@latest', 'pack', tmp, out], pkgRoot);
  run('npx', ['-y', '@anthropic-ai/mcpb@latest', 'clean', out], pkgRoot);

  console.log(`\nbundle: wrote ${out}`);
  console.log(
    `bundle: publish -> npx -y @smithery/cli mcp publish ${out} -n mcpindex-ai/mcp-server-mcpindex`,
  );
} finally {
  await rm(tmp, { recursive: true, force: true });
}
