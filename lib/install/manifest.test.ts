import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  GATE_METHODS,
  DIRECTORY_CLIENTS,
  METHOD_MATRIX,
  DIRECTORY_CONFIG_JSON,
  cursorDeepLink,
  vscodeDeepLink,
  gateInstallLine,
  GATE_WIRING_HOSTS,
  PACKAGES,
} from './manifest';
import {
  INSTALL_SHELL_COMMAND,
} from '../install-command';
import {
  GATE_PACKAGE,
  GATE_UV_INSTALL,
  DISCOVERY_PACKAGE,
  DISCOVERY_CLAUDE_MCP_ADD,
  DISCOVERY_GEMINI_MCP_ADD,
  GATE_HOSTS_SHORT,
  GATE_HOSTS_DOCS,
} from '../client-install';

// No em-dash anywhere in copied commands/notes (site-wide hard rule).
test('manifest contains no em-dash', () => {
  const blob = JSON.stringify({ GATE_METHODS, DIRECTORY_CLIENTS, METHOD_MATRIX });
  assert.ok(!blob.includes('—'), 'found an em-dash in install manifest copy');
});

// The EOL binary must never resurface in install copy.
test('no EOL mcpindex-preflight reference', () => {
  const blob = JSON.stringify({ GATE_METHODS, DIRECTORY_CLIENTS, METHOD_MATRIX, DIRECTORY_CONFIG_JSON });
  assert.ok(!blob.includes('mcpindex-preflight'), 'EOL preflight leaked into install manifest');
});

test('cursor deep link is well-formed and decodes to the npx server', () => {
  const link = cursorDeepLink();
  assert.match(link, /^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=mcpindex&config=/);
  const config = link.split('config=')[1];
  const decoded = JSON.parse(Buffer.from(config, 'base64url').toString());
  assert.equal(decoded.command, 'npx');
  assert.deepEqual(decoded.args, ['-y', 'mcp-server-mcpindex@latest']);
});

test('vscode deep link round-trips to a named server payload', () => {
  const link = vscodeDeepLink();
  assert.match(link, /^vscode:mcp\/install\?/);
  const payload = JSON.parse(decodeURIComponent(link.split('?')[1]));
  assert.equal(payload.name, 'mcpindex');
  assert.equal(payload.command, 'npx');
});

test('directory config JSON parses and points at the directory package', () => {
  const parsed = JSON.parse(DIRECTORY_CONFIG_JSON);
  assert.deepEqual(parsed.mcpServers.mcpindex.args, ['-y', `${PACKAGES.directoryServer}@latest`]);
});

test('gate one-liner leads the gate methods', () => {
  assert.equal(GATE_METHODS[0].id, 'curl');
  assert.match(GATE_METHODS[0].command, /install\.sh \| sh$/);
});

test('gateInstallLine derives commands + hosts from the manifest (llms surfaces)', () => {
  const plain = gateInstallLine();
  // Carries the exact manifest commands, not a hand-synced copy.
  assert.ok(plain.includes(GATE_METHODS.find((m) => m.id === 'uv')!.command));
  assert.ok(plain.includes(GATE_METHODS.find((m) => m.id === 'curl')!.command));
  assert.ok(plain.includes(GATE_WIRING_HOSTS.join(' / ')));
  assert.ok(plain.includes(PACKAGES.gateBinary));
  // Steers off the EOL binary; plain form has no backticks.
  assert.ok(plain.includes('EOL'));
  assert.ok(!plain.includes('`'));
  // Markdown form backticks the commands.
  assert.ok(gateInstallLine({ code: true }).includes('`'));
});

// The GATE wires more hosts than the advisory directory server runs in. The
// machine-surface host list must be the complete gate set (an LLM reads it as
// exhaustive), NOT the directory picker - or it understates the gate.
test('GATE_WIRING_HOSTS is the complete gate set: superset of the picker, incl. VS Code + Windsurf', () => {
  assert.ok(GATE_WIRING_HOSTS.includes('VS Code'), 'gate wires VS Code');
  assert.ok(GATE_WIRING_HOSTS.includes('Windsurf'), 'gate wires Windsurf');
  const gateHosts: readonly string[] = GATE_WIRING_HOSTS;
  const pickerHosts = DIRECTORY_CLIENTS.filter((c) => c.id !== 'raw').map((c) => c.label);
  for (const h of pickerHosts) {
    assert.ok(gateHosts.includes(h), `gate host set must include picker host "${h}"`);
  }
  assert.ok(GATE_WIRING_HOSTS.length > pickerHosts.length, 'gate host set must be a strict superset');
});

// Consolidation guard: the homepage/CTA constants re-export the manifest value,
// so a rename can't leave the homepage and /install serving different commands.
test('legacy install constants derive from the manifest (no parallel source)', () => {
  assert.equal(INSTALL_SHELL_COMMAND, GATE_METHODS.find((m) => m.id === 'curl')!.command);
  assert.equal(GATE_PACKAGE, PACKAGES.gateBinary);
  assert.equal(GATE_UV_INSTALL, GATE_METHODS.find((m) => m.id === 'uv')!.command);
  assert.equal(DISCOVERY_PACKAGE, PACKAGES.directoryServer);
  assert.equal(DISCOVERY_CLAUDE_MCP_ADD, DIRECTORY_CLIENTS.find((c) => c.id === 'claude-code')!.value);
  assert.equal(DISCOVERY_GEMINI_MCP_ADD, DIRECTORY_CLIENTS.find((c) => c.id === 'gemini')!.value);
});

// Emission guard: the machine surfaces must actually render gateInstallLine();
// a refactor that dropped the call would silently un-derive them. Source-text
// check (network-free) so it runs in the unit suite. Match the CALL shape
// 'gateInstallLine(' - the plain name also appears in the `import { ... }` line,
// so a bare-name check would pass even if only the import survived. Path is
// resolved from this file (import.meta.url), not process.cwd(), so running the
// file directly from its own dir does not throw ENOENT.
test('llms.txt and llms-full.txt render the derived gateInstallLine()', () => {
  for (const f of ['app/llms.txt/route.ts', 'app/llms-full.txt/route.ts']) {
    const src = readFileSync(fileURLToPath(new URL(`../../${f}`, import.meta.url)), 'utf8');
    assert.ok(src.includes('gateInstallLine('), `${f} must CALL gateInstallLine(), not just import it`);
  }
});

// Honesty guard: the trimmed marketing host list (rendered on the homepage as an
// affirmative "the gate wires X" claim) must never name a host the gate does not
// actually wire. Every host in it must be in the authoritative GATE_WIRING_HOSTS.
test('marketing host lists are a subset of GATE_WIRING_HOSTS (no over-claim)', () => {
  const gateHosts: readonly string[] = GATE_WIRING_HOSTS;
  const named = [GATE_HOSTS_SHORT, GATE_HOSTS_DOCS].flatMap((s) =>
    s
      .split(/[/,]| and /)
      .map((h) => h.trim())
      .filter((h) => h.length > 0),
  );
  assert.ok(named.length >= 6, 'marketing host lists should parse to real host names');
  for (const h of named) {
    assert.ok(gateHosts.includes(h), `marketing list names "${h}" which the gate does not wire`);
  }
});
