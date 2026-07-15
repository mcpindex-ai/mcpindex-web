import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GATE_METHODS,
  DIRECTORY_CLIENTS,
  METHOD_MATRIX,
  DIRECTORY_CONFIG_JSON,
  cursorDeepLink,
  vscodeDeepLink,
  PACKAGES,
} from './manifest';

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
