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
  assert.deepEqual([...stripe.envSecretKeys], ['STRIPE_SECRET_KEY']);
  const github = servers.find((s) => s.name === 'github')!;
  assert.equal(github.transport, 'remote');
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
});
