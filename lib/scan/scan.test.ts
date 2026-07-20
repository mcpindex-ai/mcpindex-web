import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './vendor/actionClass';
import { parseConfig, parseToolsList, detectInput, tolerantParse } from './parse';
import { classifyTools, summarize } from './summarize';
import { analyze } from './analyze';
import { SAMPLE_TOOLS, SAMPLE_CONFIG_JSON } from './samples';

// ---------------------------------------------------------------- parity vectors
// If the vendored classifier ever diverges from the SDK's known-correct grading,
// these fail - the signal to re-vendor from mcpindex-trust/clients/ts/src.

test('classify: read_file is read / none / reversible / none', () => {
  const ac = classify('read_file', 'Read a file and return its contents.', { type: 'object', properties: { path: { type: 'string' } } }, { readOnlyHint: true });
  assert.equal(ac.effective_action_type, 'read');
  assert.equal(ac.side_effect_class, 'none');
  assert.equal(ac.reversibility, 'reversible');
  assert.equal(ac.egress, 'none');
});

test('classify: delete_file is destructive + irreversible', () => {
  const ac = classify('delete_file', 'Delete a file from disk.', { type: 'object', properties: { path: { type: 'string' } } }, null);
  assert.equal(ac.effective_action_type, 'delete');
  assert.equal(ac.side_effect_class, 'destructive');
  assert.equal(ac.reversibility, 'irreversible');
});

test('classify: slack_send_message egresses externally', () => {
  const ac = classify('slack_send_message', 'Send a message to a Slack channel.', { type: 'object', properties: { message: { type: 'string' } } }, null);
  assert.equal(ac.effective_action_type, 'send');
  assert.equal(ac.side_effect_class, 'outbound');
  assert.equal(ac.egress, 'external');
});

test('classify: run_command is never-unattended', () => {
  const ac = classify('run_command', 'Execute a shell command.', { type: 'object', properties: { command: { type: 'string' } } }, null);
  assert.equal(ac.effective_action_type, 'execute');
  assert.equal(ac.autonomy_ceiling, 'never-unattended');
});

test('classify: readOnlyHint contradicting a write raises a risk note', () => {
  const ac = classify('update_record', 'Update a record.', { type: 'object', properties: { body: { type: 'string' } } }, { readOnlyHint: true });
  assert.ok(ac.known_risk_notes.some((n) => n.note_class === 'annotation_contradicts_probe'));
});

test('classify never throws on hostile / malformed input', () => {
  for (const bad of [null, undefined, 42, [], { properties: 'x' }, { properties: { a: { type: 'array' } } }]) {
    assert.doesNotThrow(() => classify('x'.repeat(20000), 'y', bad, bad));
  }
});

// ------------------------------------------------------------------- parsers
test('parseConfig normalizes mcpServers with transports + secret keys', () => {
  const servers = parseConfig(JSON.parse(SAMPLE_CONFIG_JSON));
  assert.equal(servers.length, 3);
  const stripe = servers.find((s) => s.name === 'stripe')!;
  assert.equal(stripe.transport, 'local');
  assert.deepEqual([...stripe.secretKeys], ['STRIPE_SECRET_KEY']);
  const github = servers.find((s) => s.name === 'github')!;
  assert.equal(github.transport, 'remote');
});

test('parseConfig finds credentials in `headers`, not just `env`', () => {
  const servers = parseConfig({
    mcpServers: {
      // the real-world remote shape: credential lives in a header, and the header
      // name matches no secret-ish word. An env-only scan called this clean.
      orbital: { type: 'http', url: 'https://x.example/mcp', headers: { Authorization: 'Bearer abc123' } },
      uptime: { type: 'http', url: 'https://y.example/mcp', headers: { 'X-Api-Key': 'k' } },
      bland: { type: 'http', url: 'https://z.example/mcp', headers: { 'X-Trace': 'Bearer zzz' } },
      none: { type: 'http', url: 'https://n.example/mcp', headers: { 'X-Trace-Id': 'abc' } },
    },
  });
  const keys = (n: string) => [...servers.find((s) => s.name === n)!.secretKeys];
  assert.deepEqual(keys('orbital'), ['header:Authorization']);
  assert.deepEqual(keys('uptime'), ['header:X-Api-Key']); // matched on name
  assert.deepEqual(keys('bland'), ['header:X-Trace']); // matched on value shape
  assert.deepEqual(keys('none'), []); // a bland header is not a finding
});

test('parseConfig reports header key NAMES only, never values', () => {
  const [s] = parseConfig({
    mcpServers: { a: { url: 'https://x.example/mcp', headers: { Authorization: 'Bearer SUPERSECRET' } } },
  });
  // Both halves matter: detection HAPPENED, and the value did not ride along.
  // Asserting only the absence would also pass if detection silently regressed.
  assert.deepEqual([...s.secretKeys], ['header:Authorization']);
  assert.ok(!JSON.stringify(s).includes('SUPERSECRET'));
});

test('insecureTransport flags plaintext remotes but exempts loopback', () => {
  const servers = parseConfig({
    mcpServers: {
      plain: { url: 'http://mcp.example.com/mcp' },
      loopback: { url: 'http://localhost:8000/mcp' },
      loopIp: { url: 'http://127.0.0.1:8000/mcp' },
      tls: { url: 'https://mcp.example.com/mcp' },
      local: { command: 'npx', args: ['some-mcp'] },
    },
  });
  const insecure = (n: string) => servers.find((s) => s.name === n)!.insecureTransport;
  assert.equal(insecure('plain'), true);
  assert.equal(insecure('loopback'), false);
  assert.equal(insecure('loopIp'), false);
  assert.equal(insecure('tls'), false);
  assert.equal(insecure('local'), false);
});

test('insecureTransport: loopback exemption cannot be spoofed by a hostname prefix', () => {
  const servers = parseConfig({
    mcpServers: {
      // registrable domains that merely START with a loopback-looking label -
      // an unanchored /^127\./ would call these clean
      spoofIp: { url: 'http://127.0.0.1.evil.com/mcp' },
      spoofLabel: { url: 'http://127.evil.com/mcp' },
      spoofName: { url: 'http://localhost.evil.com/mcp' },
      // a stdio server carrying a stray url never speaks HTTP
      stdio: { type: 'stdio', command: 'db-mcp', url: 'http://internal.example.com/x' },
    },
  });
  const insecure = (n: string) => servers.find((s) => s.name === n)!.insecureTransport;
  assert.equal(insecure('spoofIp'), true);
  assert.equal(insecure('spoofLabel'), true);
  assert.equal(insecure('spoofName'), true);
  assert.equal(insecure('stdio'), false);
});

// --------------------------------------------------- value redaction (display)
// The tool renders `url` and `command` into the results table, which users
// screenshot and share. A secret reaching either field breaks the names-only
// promise, so each shape below is a regression guard, not a style preference.
const cmdOf = (def: Record<string, unknown>) => parseConfig({ mcpServers: { s: def } })[0].command!;
const urlOf = (u: string) => parseConfig({ mcpServers: { s: { url: u } } })[0].url!;

test('redaction: space-separated credential flags are masked', () => {
  const c = cmdOf({ command: 'npx', args: ['srv', '--api-key', 'sk-live-SECRET1'] });
  assert.ok(!c.includes('SECRET1'), c);
  assert.ok(c.includes('--api-key ***'), c);
});

test('redaction: --flag=value credential flags are masked', () => {
  const c = cmdOf({ command: 'srv', args: ['--token=sk-live-SECRET2'] });
  assert.ok(!c.includes('SECRET2'), c);
  assert.ok(c.includes('--token=***'), c);
});

test('redaction: a bare positional token-shaped arg is masked', () => {
  const c = cmdOf({ command: 'srv', args: ['NjQ4LTU5NzQtNGE4Zi1hYzM4XYZ'] });
  assert.equal(c, 'srv ***');
});

test('redaction: a flag followed by another flag does not swallow the flag', () => {
  const c = cmdOf({ command: 'srv', args: ['--token', '--verbose'] });
  assert.equal(c, 'srv --token --verbose');
});

test('redaction: real-world args are NOT over-masked', () => {
  // paths and scoped package names are long and mixed-charset but never secrets
  assert.equal(
    cmdOf({ command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/Volumes/GB990Pro/GBCode'] }),
    'npx -y @modelcontextprotocol/server-filesystem /Volumes/GB990Pro/GBCode',
  );
  assert.equal(cmdOf({ command: 'npx', args: ['@playwright/mcp@latest'] }), 'npx @playwright/mcp@latest');
  assert.equal(cmdOf({ command: 'uvx', args: ['mcp-server-git'] }), 'uvx mcp-server-git');
});

test('redaction: a credential embedded in the URL PATH is masked', () => {
  // the Zapier / hosted-provider shape: the whole bearer secret is a path segment
  const u = urlOf('https://mcp.zapier.com/api/mcp/s/NjQ4LTU5NzQtNGE4Zi1hYzM4XYZ/mcp');
  assert.ok(!u.includes('NjQ4'), u);
  assert.equal(u, 'https://mcp.zapier.com/api/mcp/s/***/mcp');
});

test('redaction: bare ?key= and ?signature= query params are masked', () => {
  for (const [q, secret] of [['key', 'SUPERSECRET_A'], ['signature', 'SUPERSECRET_B'], ['code', 'SUPERSECRET_C']]) {
    const u = urlOf(`https://x.example/mcp?${q}=${secret}`);
    assert.ok(!u.includes(secret), u);
  }
});

test('redaction: URL userinfo is masked but the signal is kept', () => {
  const u = urlOf('https://user:hunter2@x.example/mcp');
  assert.ok(!u.includes('hunter2'), u);
  assert.ok(u.includes('***@'), u);
});

test('redaction: unparseable URLs still get a linear scrub', () => {
  const u = urlOf('mcp.example.com/s/NjQ4LTU5NzQtNGE4Zi1hYzM4XYZ/mcp');
  assert.ok(!u.includes('NjQ4'), u);
});

test('redaction is linear on hostile input (no catastrophic backtracking)', () => {
  // the previous joined-string regex went quadratic here: ~30s at 160k chars
  const hostile = `--api-key=${'a-1.'.repeat(50_000)}`;
  const t0 = performance.now();
  cmdOf({ command: 'srv', args: [hostile] });
  urlOf(`https://x.example/${'a-1.'.repeat(50_000)}`);
  assert.ok(performance.now() - t0 < 2000, `took ${performance.now() - t0}ms`);
});

test('parseConfig matches the Authentication header spelling', () => {
  const [s] = parseConfig({
    mcpServers: { a: { url: 'https://x.example/mcp', headers: { Authentication: 'abc' } } },
  });
  assert.deepEqual([...s.secretKeys], ['header:Authentication']);
});

test('parseConfig handles the VS Code `servers` wrapper', () => {
  const servers = parseConfig({ servers: { db: { type: 'stdio', command: 'db-mcp' } } });
  assert.equal(servers.length, 1);
  assert.equal(servers[0].transport, 'local');
});

test('parseToolsList accepts array, {tools}, and JSON-RPC envelope', () => {
  assert.equal(parseToolsList(SAMPLE_TOOLS).length, SAMPLE_TOOLS.length);
  assert.equal(parseToolsList({ tools: SAMPLE_TOOLS }).length, SAMPLE_TOOLS.length);
  assert.equal(parseToolsList({ jsonrpc: '2.0', id: 1, result: { tools: SAMPLE_TOOLS } }).length, SAMPLE_TOOLS.length);
});

test('parsers are total on garbage', () => {
  for (const bad of [null, 3, 'nope', {}, [], { mcpServers: 5 }]) {
    assert.doesNotThrow(() => parseConfig(bad));
    assert.doesNotThrow(() => parseToolsList(bad));
    assert.doesNotThrow(() => detectInput(bad));
  }
});

test('tolerantParse eats JSONC comments + trailing commas, keeps strings intact', () => {
  const jsonc = `{
    // my servers
    "mcpServers": {
      "fs": { "command": "npx", "args": ["-y", "server"], }, /* note the url has // in it */
      "gh": { "url": "https://api.example/mcp" },
    }
  }`;
  const parsed = tolerantParse(jsonc) as Record<string, unknown>;
  const servers = parseConfig(parsed);
  assert.equal(servers.length, 2);
  assert.equal(servers.find((s) => s.name === 'gh')!.url, 'https://api.example/mcp');
  assert.equal(tolerantParse('not json at all'), undefined);
  assert.equal(tolerantParse(''), undefined);
});

test('tolerantParse preserves commas INSIDE string values on the lenient path', () => {
  // A comment forces the lenient path; a comma-before-`]` inside a string must survive.
  const jsonc = '{ /* c */ "mcpServers": { "x": { "command": "run", "args": ["--filter=[a, ]"] } } }';
  const parsed = tolerantParse(jsonc) as Record<string, unknown>;
  const servers = parseConfig(parsed);
  assert.equal(servers.length, 1);
  assert.match(servers[0].command!, /\[a, \]/); // comma retained
});

test('parseConfig redacts secret VALUES in command args and URL query', () => {
  const s = parseConfig({
    mcpServers: {
      a: { command: 'npx', args: ['server', '--token=sk_live_SHOULD_NOT_SHOW'] },
      b: { url: 'https://user:pw@h/mcp?apikey=SECRET_SHOULD_NOT_SHOW' },
    },
  });
  const a = s.find((x) => x.name === 'a')!;
  const b = s.find((x) => x.name === 'b')!;
  assert.doesNotMatch(a.command!, /sk_live_SHOULD_NOT_SHOW/);
  assert.match(a.command!, /token=\*\*\*/);
  assert.doesNotMatch(b.url!, /SECRET_SHOULD_NOT_SHOW/);
  assert.doesNotMatch(b.url!, /user:pw/);
});

test('detectInput routes config vs tools vs unknown', () => {
  assert.equal(detectInput(JSON.parse(SAMPLE_CONFIG_JSON)).kind, 'config');
  assert.equal(detectInput({ tools: SAMPLE_TOOLS }).kind, 'tools');
  assert.equal(detectInput(SAMPLE_TOOLS).kind, 'tools');
  assert.equal(detectInput({ hello: 'world' }).kind, 'unknown');
});

// ------------------------------------------------------------------- summary
test('summarize rolls the sample toolset into the headline counts', () => {
  const tools = classifyTools(SAMPLE_TOOLS);
  const s = summarize([], tools);
  assert.equal(s.level, 'tool');
  assert.equal(s.counts.tools, SAMPLE_TOOLS.length);
  assert.equal(s.counts.unpinned, SAMPLE_TOOLS.length);
  assert.ok(s.counts.irreversible >= 3, `irreversible was ${s.counts.irreversible}`);
  assert.ok(s.counts.egressExternal >= 1, `egress was ${s.counts.egressExternal}`);
  assert.ok(s.counts.destructive >= 3, `destructive was ${s.counts.destructive}`);
  assert.ok(s.counts.readOnly >= 3, `readOnly was ${s.counts.readOnly}`);
});

// ------------------------------------------------------------------- analyze
test('analyze routes text -> invalid / unknown / config / tools', () => {
  assert.equal(analyze('').kind, 'invalid'); // empty is not JSON
  assert.equal(analyze('not json').kind, 'invalid');
  assert.equal(analyze('{"hello":"world"}').kind, 'unknown');
  const cfg = analyze(SAMPLE_CONFIG_JSON);
  assert.equal(cfg.kind, 'summary');
  if (cfg.kind === 'summary') {
    assert.equal(cfg.source, 'config');
    assert.equal(cfg.data.level, 'server');
  }
  const tools = analyze(JSON.stringify({ tools: SAMPLE_TOOLS }));
  assert.equal(tools.kind, 'summary');
  if (tools.kind === 'summary') assert.equal(tools.source, 'tools');
});

test('summarize server-level counts remote/local/secret servers', () => {
  const servers = parseConfig(JSON.parse(SAMPLE_CONFIG_JSON));
  const s = summarize(servers, []);
  assert.equal(s.level, 'server');
  assert.equal(s.counts.servers, 3);
  assert.equal(s.counts.remoteServers, 1);
  assert.equal(s.counts.localServers, 2);
  assert.equal(s.counts.serversWithSecrets, 1);
  assert.equal(s.counts.insecureRemotes, 0);
});

test('summarize counts header-credentialed and plaintext remotes', () => {
  const servers = parseConfig({
    mcpServers: {
      a: { url: 'http://mcp.example.com/mcp', headers: { Authorization: 'Bearer x' } },
      b: { url: 'https://ok.example.com/mcp' },
    },
  });
  const s = summarize(servers, []);
  assert.equal(s.counts.serversWithSecrets, 1);
  assert.equal(s.counts.insecureRemotes, 1);
});
