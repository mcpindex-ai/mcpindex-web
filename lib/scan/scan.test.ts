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

test('detection is at least as smart as redaction: secret by VALUE SHAPE', () => {
  // the detector previously trailed the redactor: /scan would MASK sk-ant-... in the
  // detail column while reporting the same server as carrying no credential
  const servers = parseConfig({
    mcpServers: {
      blandHeader: { url: 'https://x.example/mcp', headers: { 'X-Trace': 'sk-ant-api03-AbC123XyZ9876543210' } },
      bareKeyEnv: { command: 'srv', env: { KEY: 'sk-live-AbC123XyZ9876543210' } },
      interpolated: { url: 'https://x.example/mcp', headers: { 'X-Thing': '${SOME_VAR}' } },
      plainValue: { command: 'srv', env: { LOG_LEVEL: 'debug', HOME_DIR: '/Users/someone/projects' } },
    },
  });
  const keys = (n: string) => [...servers.find((s) => s.name === n)!.secretKeys];
  assert.deepEqual(keys('blandHeader'), ['header:X-Trace']);
  assert.deepEqual(keys('bareKeyEnv'), ['KEY']);
  assert.deepEqual(keys('interpolated'), []); // a ${VAR} placeholder is not a secret
  assert.deepEqual(keys('plainValue'), []); // prose and paths are not secrets
});

test('detection does NOT cry wolf on realistic non-secret env values', () => {
  // Detection uses a narrow issuer-prefix test, NOT the broad shape heuristic used
  // for masking: an over-broad mask costs legibility, an over-broad detection is a
  // false security claim. These all reported as credentials under the shape test.
  const env: Record<string, string> = {
    PUBLIC_KEY: '/etc/ssl/pub.pem',
    KEY_PATH: '/home/u/id_rsa',
    KEYCLOAK_URL: 'https://kc.example.com',
    SSH_KEY_FILE: '~/.ssh/id_ed25519',
    LANG: 'en_US.UTF-8',
    SESSION_TIMEOUT: '3600',
    BUILD_ID: '550e8400-e29b-41d4-a716-446655440000',
    VERSION: '1.2.3-beta.20240101',
  };
  for (const [k, v] of Object.entries(env)) {
    const [s] = parseConfig({ mcpServers: { a: { command: 'srv', env: { [k]: v } } } });
    assert.deepEqual([...s.secretKeys], [], `${k}=${v} should not read as a credential`);
  }
});

test('detection reports credentials carried in the URL or in args, not just env/headers', () => {
  // The redactors masked these but detection reported nothing - the original bug
  // ("masked yet reported clean") one layer down. Locations only, never values.
  const k = (def: Record<string, unknown>) => [...parseConfig({ mcpServers: { a: def } })[0].secretKeys];
  assert.deepEqual(k({ url: 'https://x.example/mcp?api_key=AbC123XyZ9876543210' }), ['url:?api_key']);
  assert.deepEqual(k({ url: 'https://mcp.zapier.com/api/mcp/s/NjQ4LTU5NzQtNGE4Zi1hYzM4XYZ/mcp' }), ['url:path']);
  assert.deepEqual(k({ url: 'https://u:pw@x.example/mcp' }), ['url:userinfo']);
  assert.deepEqual(k({ command: 'npx', args: ['srv', '--api-key', 'sk-live-X'] }), ['arg:--api-key']);
});

test('insecureTransport does not fabricate findings on non-HTTP url values', () => {
  // a `url` holding a socket path, `stdio`, or a command line is malformed, not
  // insecure - the fail-closed schemeless branch must not claim plaintext for these
  for (const u of ['file:///tmp/s.sock', 'unix:///var/run/m.sock', 'stdio', '/usr/local/bin/mcp', 'npx -y @modelcontextprotocol/server-filesystem', '', '   ', 'ftp://x.example/f']) {
    const [s] = parseConfig({ mcpServers: { a: { type: 'http', url: u } } });
    assert.equal(s.insecureTransport, false, `${JSON.stringify(u)} should not read as plaintext http`);
  }
});

test('parseConfig reads the array form of `headers`', () => {
  const [s] = parseConfig({
    mcpServers: {
      a: { url: 'https://x.example/mcp', headers: [{ name: 'Authorization', value: 'Bearer SECRETV' }] },
    },
  });
  assert.deepEqual([...s.secretKeys], ['header:Authorization']);
  assert.ok(!JSON.stringify(s).includes('SECRETV'));
});

test('insecureTransport: a schemeless URL declares no TLS, so it fails CLOSED', () => {
  const servers = parseConfig({
    mcpServers: {
      schemeless: { type: 'http', url: 'mcp.example.com/mcp' },
      schemelessLoopback: { type: 'http', url: 'localhost:8000/mcp' },
      tls: { url: 'https://mcp.example.com/mcp' },
      wss: { url: 'wss://mcp.example.com/mcp' },
    },
  });
  const insecure = (n: string) => servers.find((s) => s.name === n)!.insecureTransport;
  assert.equal(insecure('schemeless'), true); // previously false: silently "secure"
  assert.equal(insecure('schemelessLoopback'), false);
  assert.equal(insecure('tls'), false);
  assert.equal(insecure('wss'), false);
});

test('insecureTransport: IPv4-mapped IPv6 loopback is exempt', () => {
  const servers = parseConfig({
    mcpServers: {
      mapped: { url: 'http://[::ffff:127.0.0.1]/mcp' }, // normalizes to [::ffff:7f00:1]
      v6: { url: 'http://[::1]/mcp' },
      mappedPublic: { url: 'http://[::ffff:8.8.8.8]/mcp' },
    },
  });
  const insecure = (n: string) => servers.find((s) => s.name === n)!.insecureTransport;
  assert.equal(insecure('mapped'), false);
  assert.equal(insecure('v6'), false);
  assert.equal(insecure('mappedPublic'), true); // exemption must not over-apply
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

test('analyze names the double-paste case instead of a generic "not JSON"', () => {
  const one = JSON.stringify({ mcpServers: { fs: { command: 'npx', args: ['-y', 'server'] } } }, null, 2);

  // Shape 1: a second document appended after the first.
  const appended = analyze(`${one}\n${one}`);
  assert.equal(appended.kind, 'invalid');
  assert.equal(appended.kind === 'invalid' && appended.reason, 'double-paste');

  // Shape 2: the paste landed INSIDE the first (caret before the closing brace).
  // This is the shape a real report had, and it stays brace-balanced - so a
  // balance-based salvage would have "succeeded" on a document that is nonsense.
  const nested = one.replace(/\n\}\s*$/, `\n${one}\n}`);
  const inner = analyze(nested);
  assert.equal(inner.kind, 'invalid');
  assert.equal(inner.kind === 'invalid' && inner.reason, 'double-paste');

  // A single config still parses, and genuine garbage keeps the generic reason.
  assert.equal(analyze(one).kind, 'summary');
  const garbage = analyze('not json at all');
  assert.equal(garbage.kind, 'invalid');
  assert.equal(garbage.kind === 'invalid' && garbage.reason, undefined);

  // One config whose VALUES mention the key name must not be misread as a double paste.
  const decoy = JSON.stringify({ mcpServers: { x: { command: 'cat', args: ['"mcpServers":'] } } });
  assert.equal(analyze(decoy).kind, 'summary');
});

// ------------------------------------------------- blast radius (server level)

test('secretsInFile separates a literal credential from an ${ENV} reference', () => {
  const servers = parseConfig({
    mcpServers: {
      literal: { url: 'https://a/mcp', headers: { Authorization: 'Bearer ghp_realLookingToken1234567890' } },
      ref: { url: 'https://b/mcp', headers: { Authorization: 'Bearer ${GITHUB_TOKEN}' } },
      bare: { url: 'https://c/mcp', headers: { Authorization: '$GITHUB_TOKEN' } },
      envRef: { command: 'x', env: { API_KEY: '${MY_KEY}' } },
      envLiteral: { command: 'x', env: { API_KEY: 'sk-live-abcdef1234567890' } },
    },
  });
  const by = (n: string) => servers.find((s) => s.name === n)!;
  // All five carry a credential...
  assert.equal(servers.filter((s) => s.secretKeys.length > 0).length, 5);
  // ...but only the two literals put it in the file.
  assert.deepEqual(
    servers.filter((s) => s.secretsInFile.length > 0).map((s) => s.name).sort(),
    ['envLiteral', 'literal'],
  );
  assert.equal(by('ref').secretsInFile.length, 0);
  assert.equal(by('bare').secretsInFile.length, 0);
});

test('reach separates a service on this machine from one reachable off it', () => {
  const servers = parseConfig({
    mcpServers: {
      loop: { url: 'http://127.0.0.1:8000/mcp' },
      named: { url: 'http://localhost:8000/mcp' },
      six: { url: 'http://[::1]:8000/mcp' },
      out: { url: 'https://mcp.example.com/mcp' },
      // Not loopback: a registrable domain that merely starts with 127.
      spoof: { url: 'https://127.0.0.1.evil.com/mcp' },
      proc: { command: 'npx', args: ['-y', 'thing@1.0.0'] },
    },
  });
  const reach = Object.fromEntries(servers.map((s) => [s.name, s.reach]));
  assert.deepEqual(reach, {
    loop: 'loopback', named: 'loopback', six: 'loopback',
    out: 'internet', spoof: 'internet', proc: 'process',
  });
});

test('fetchesAtLaunch is proven from the resolver, never assumed absent', () => {
  const servers = parseConfig({
    mcpServers: {
      floating: { command: 'npx', args: ['-y', '@scope/pkg'] },
      latest: { command: 'npx', args: ['@playwright/mcp@latest'] },
      pinnedNpm: { command: 'npx', args: ['-y', 'pkg@1.2.3'] },
      pinnedPy: { command: 'uvx', args: ['--from', 'pkg==1.2.3', 'entry'] },
      floatingPy: { command: 'uvx', args: ['mcp-server-git'] },
      dockerLatest: { command: 'docker', args: ['run', 'org/img:latest'] },
      dockerPinned: { command: 'docker', args: ['run', 'org/img:1.4'] },
      // A bare binary: unknowable from a config, so NOT flagged - the absence of a
      // flag is never a claim of stability.
      binary: { command: '/Users/me/tools/thing', args: [] },
    },
  });
  const flagged = servers.filter((s) => s.fetchesAtLaunch).map((s) => s.name).sort();
  assert.deepEqual(flagged, ['dockerLatest', 'floating', 'floatingPy', 'latest']);
});

test('a gate-wrapped server reports its upstream, not the gate talking about itself', () => {
  const servers = parseConfig({
    mcpServers: {
      viaMarker: {
        command: 'uvx',
        args: ['--from', 'mcpindex-gate==0.9.2', 'mcpindex-proxy', '--mcpindex-stdio'],
        _mcpindexWired: { marker: 'mcpindex', original: { command: 'uvx', args: ['mcp-google-search-console'] } },
      },
      viaArgs: {
        command: 'uvx',
        args: [
          '--from', 'mcpindex-gate==0.10.0', 'mcpindex-proxy', '--mcpindex-stdio',
          '--upstream-command=npx', '--upstream-arg=-y', '--upstream-arg=mcp-server-mcpindex@0.3.0',
        ],
      },
      plain: { command: 'uvx', args: ['mcp-server-git'] },
    },
  });
  const by = (n: string) => servers.find((s) => s.name === n)!;
  assert.equal(by('viaMarker').gated, true);
  assert.equal(by('viaMarker').upstream, 'uvx mcp-google-search-console');
  // The wrapper pins mcpindex-gate; the UPSTREAM is what gets judged, and it floats.
  assert.equal(by('viaMarker').fetchesAtLaunch, true);

  assert.equal(by('viaArgs').gated, true);
  assert.equal(by('viaArgs').upstream, 'npx -y mcp-server-mcpindex@0.3.0');
  assert.equal(by('viaArgs').fetchesAtLaunch, false); // upstream is pinned
  assert.equal(by('plain').gated, false);
});

test('an unwrapped upstream is redacted like any other command line', () => {
  const [s] = parseConfig({
    mcpServers: {
      x: {
        command: 'uvx',
        args: ['mcpindex-proxy', '--mcpindex-stdio', '--upstream-command=serve', '--upstream-arg=--api-key=sk-live-9f8e7d6c5b4a'],
      },
    },
  });
  assert.equal(s.gated, true);
  assert.ok(!/sk-live-9f8e7d6c5b4a/.test(s.upstream ?? ''), 'the secret must not survive into the upstream string');
  assert.ok(/--api-key=/.test(s.upstream ?? ''), 'the flag itself still shows, so the finding stays legible');
});

test('pathScope claims broad only for unmistakable grants', () => {
  const servers = parseConfig({
    mcpServers: {
      root: { command: 'npx', args: ['-y', 'fs@1.0.0', '/'] },
      home: { command: 'npx', args: ['-y', 'fs@1.0.0', '/Users/bharti'] },
      tilde: { command: 'npx', args: ['-y', 'fs@1.0.0', '~'] },
      volume: { command: 'npx', args: ['-y', 'fs@1.0.0', '/Volumes/GB990Pro'] },
      project: { command: 'npx', args: ['-y', 'fs@1.0.0', '/Volumes/GB990Pro/GBCode'] },
      none: { command: 'npx', args: ['-y', 'fs@1.0.0'] },
    },
  });
  const scope = Object.fromEntries(servers.map((s) => [s.name, s.pathScope]));
  assert.deepEqual(scope, {
    root: 'broad', home: 'broad', tilde: 'broad', volume: 'broad',
    project: 'narrow', none: 'unknown',
  });
});

test('summarize rolls the blast-radius counts', () => {
  const servers = parseConfig({
    mcpServers: {
      a: { url: 'https://x/mcp', headers: { Authorization: 'Bearer ghp_literalTokenValue123456' } },
      b: { url: 'http://127.0.0.1:9/mcp' },
      c: { command: 'npx', args: ['-y', 'pkg'] },
      d: { command: 'uvx', args: ['--from', 'p==1.0.0', 'e'], _mcpindexWired: { original: { command: 'uvx', args: ['real@2.0.0'] } } },
    },
  });
  const c = summarize(servers, []).counts;
  assert.equal(c.servers, 4);
  assert.equal(c.internetReach, 1);
  assert.equal(c.loopbackServers, 1);
  assert.equal(c.secretsInFile, 1);
  assert.equal(c.fetchAtLaunch, 1); // only `c`; d's upstream is pinned
  assert.equal(c.gatedServers, 1);
});
