import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSemver,
  isOlder,
  formatUpdateMessage,
  updateCheckDisabled,
  fetchLatestVersion,
  notifyUpdateIfAvailable,
} from '../src/update-check.mjs';

test('parseSemver: canonical and rejected forms', () => {
  assert.deepEqual(parseSemver('1.2.3'), [1, 2, 3]);
  assert.deepEqual(parseSemver(' 0.3.0 '), [0, 3, 0]);
  assert.deepEqual(parseSemver('1.2.3-beta.1'), [1, 2, 3]); // prerelease dropped
  assert.deepEqual(parseSemver('1.2.3+build5'), [1, 2, 3]); // build dropped
  assert.equal(parseSemver('1.2'), null);
  assert.equal(parseSemver('1.2.x'), null);
  assert.equal(parseSemver('v1.2.3'), null);
  assert.equal(parseSemver('1.2.3.4'), null);
  assert.equal(parseSemver(''), null);
  assert.equal(parseSemver(null), null);
  assert.equal(parseSemver('1.2.' + '9'.repeat(10)), null); // 10-digit > cap
});

test('isOlder: only strictly-older canonical versions nag', () => {
  assert.equal(isOlder('0.2.2', '0.3.0'), true);
  assert.equal(isOlder('0.2.2', '0.2.3'), true);
  assert.equal(isOlder('1.0.0', '1.0.1'), true);
  assert.equal(isOlder('0.3.0', '0.3.0'), false); // equal
  assert.equal(isOlder('0.4.0', '0.3.9'), false); // newer than latest
  assert.equal(isOlder('1.2.3', '1.1.9'), false);
  assert.equal(isOlder('weird', '0.3.0'), false); // unparseable -> never nag
  assert.equal(isOlder('0.3.0', 'weird'), false);
});

test('formatUpdateMessage: advisory + carries the restart reminder', () => {
  const m = formatUpdateMessage('0.2.2', '0.3.0');
  assert.match(m, /0\.2\.2 -> 0\.3\.0/);
  assert.match(m, /npm i -g mcp-server-mcpindex@latest/);
  assert.match(m, /restart your MCP host/i);
  // honesty: advisory, never claims it protected/secured anything
  assert.doesNotMatch(m, /protect|secured|safe\b/i);
});

test('updateCheckDisabled: opt-out semantics', () => {
  assert.equal(updateCheckDisabled({}), false);
  assert.equal(updateCheckDisabled({ MCPINDEX_NO_UPDATE_CHECK: '' }), false);
  assert.equal(updateCheckDisabled({ MCPINDEX_NO_UPDATE_CHECK: '0' }), false);
  assert.equal(updateCheckDisabled({ MCPINDEX_NO_UPDATE_CHECK: 'false' }), false);
  assert.equal(updateCheckDisabled({ MCPINDEX_NO_UPDATE_CHECK: 'off' }), false);
  assert.equal(updateCheckDisabled({ MCPINDEX_NO_UPDATE_CHECK: '1' }), true);
  assert.equal(updateCheckDisabled({ MCPINDEX_NO_UPDATE_CHECK: 'yes' }), true);
  assert.equal(updateCheckDisabled({ MCPINDEX_NO_UPDATE_CHECK: 'true' }), true);
});

test('fetchLatestVersion: parses a good response', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: '0.9.1' }) });
  assert.equal(await fetchLatestVersion({ fetchImpl }), '0.9.1');
});

test('fetchLatestVersion: every failure mode returns null, never throws', async () => {
  const notOk = async () => ({ ok: false, json: async () => ({}) });
  assert.equal(await fetchLatestVersion({ fetchImpl: notOk }), null);

  const badJson = async () => ({ ok: true, json: async () => ({ nope: true }) });
  assert.equal(await fetchLatestVersion({ fetchImpl: badJson }), null);

  const nonSemver = async () => ({ ok: true, json: async () => ({ version: 'latest' }) });
  assert.equal(await fetchLatestVersion({ fetchImpl: nonSemver }), null);

  const throws = async () => { throw new Error('network down'); };
  assert.equal(await fetchLatestVersion({ fetchImpl: throws }), null);

  // fetchImpl is called as (url, options) — read the abort signal from options (2nd arg)
  const aborts = async (_url, { signal } = {}) =>
    new Promise((_resolve, reject) => {
      if (signal) signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  assert.equal(await fetchLatestVersion({ fetchImpl: aborts, timeoutMs: 10 }), null);
});

test('notifyUpdateIfAvailable: emits to stderr ONLY — never a notifications/message', async () => {
  const logged = [];
  const notified = [];
  // Even if a host-like server is handed in, we must NOT push an MCP logging notification —
  // hosts render it inconsistently (Cursor logs a bare ` undefined`). stderr is the channel.
  const server = { sendLoggingMessage: async (p) => { notified.push(p); } };
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: '0.3.0' }) });
  const msg = await notifyUpdateIfAvailable({
    currentVersion: '0.2.2', server, env: {}, fetchImpl,
    log: (m) => logged.push(m),
  });
  assert.ok(msg);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /0\.2\.2 -> 0\.3\.0/);
  assert.equal(notified.length, 0, 'must NOT emit notifications/message (Cursor shows it as undefined)');
});

test('notifyUpdateIfAvailable: silent when up to date', async () => {
  const logged = [];
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: '0.3.0' }) });
  const msg = await notifyUpdateIfAvailable({
    currentVersion: '0.3.0', env: {}, fetchImpl, log: (m) => logged.push(m),
  });
  assert.equal(msg, null);
  assert.equal(logged.length, 0);
});

test('notifyUpdateIfAvailable: opt-out short-circuits before any fetch', async () => {
  let fetched = false;
  const fetchImpl = async () => { fetched = true; return { ok: true, json: async () => ({ version: '9.9.9' }) }; };
  const msg = await notifyUpdateIfAvailable({
    currentVersion: '0.2.2', env: { MCPINDEX_NO_UPDATE_CHECK: '1' }, fetchImpl, log: () => {},
  });
  assert.equal(msg, null);
  assert.equal(fetched, false);
});

test('notifyUpdateIfAvailable: a throwing fetch never surfaces', async () => {
  const fetchImpl = async () => { throw new Error('boom'); };
  const msg = await notifyUpdateIfAvailable({
    currentVersion: '0.2.2', env: {}, fetchImpl, log: () => {},
  });
  assert.equal(msg, null);
});
