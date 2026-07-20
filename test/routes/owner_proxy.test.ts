// Same-origin owner-verification proxy (app/api/owner/[action]/route.ts). Verifies the
// closed-vocab allowlist, request-scoped apiKey handling (never in a URL, never logged),
// upstream 2xx/4xx pass-through, and the no-body-leak / generic-error posture on 5xx +
// network failure. The route uses the global fetch (like app/api/[transport]/route.ts),
// so we swap globalThis.fetch around each test and record what it was called with.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { POST as owner } from '../../app/api/owner/[action]/route';

const KEY = 'mcpk_' + 'A1b2C3d4E5f6G7h8';
const SERVER = 'io.github.you/srv';

interface Call {
  url: string;
  init: RequestInit;
}

// Install a fetch that records the outbound call and returns `resp`. `throwWith` makes it
// reject (network error / timeout simulation) instead.
function installFetch(resp?: Response, throwWith?: Error): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (throwWith) throw throwWith;
    return resp ?? new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = orig; } };
}

// Capture everything written to the console so we can prove the apiKey never leaks to a log.
function captureConsole(): { logs: string[]; restore: () => void } {
  const logs: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info, debug: console.debug };
  const sink = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  console.log = sink; console.warn = sink; console.error = sink; console.info = sink; console.debug = sink;
  return { logs, restore: () => { Object.assign(console, orig); } };
}

let fx: ReturnType<typeof installFetch> | null = null;
beforeEach(() => { fx = null; });
afterEach(() => { fx?.restore(); });

const obj = (r: { json: () => unknown }) => r.json() as Record<string, unknown>;

test('unknown action → 404 closed-vocab (no upstream call)', async () => {
  fx = installFetch();
  const r = await callRoute(owner, '/api/owner/frobnicate', {
    method: 'POST', params: { action: 'frobnicate' }, body: { apiKey: KEY, serverId: SERVER },
  });
  assert.equal(r.status, 404);
  assert.equal(obj(r).error, 'unknown action');
  assert.equal(fx.calls.length, 0, 'unknown action must not reach upstream');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('missing apiKey → 400 (no upstream call)', async () => {
  fx = installFetch();
  const r = await callRoute(owner, '/api/owner/challenge', {
    method: 'POST', params: { action: 'challenge' }, body: { serverId: SERVER },
  });
  assert.equal(r.status, 400);
  assert.match(String(obj(r).error), /apiKey/);
  assert.equal(fx.calls.length, 0);
});

test('malformed apiKey (wrong prefix) → 400', async () => {
  fx = installFetch();
  const r = await callRoute(owner, '/api/owner/challenge', {
    method: 'POST', params: { action: 'challenge' }, body: { apiKey: 'sk-not-ours-123456', serverId: SERVER },
  });
  assert.equal(r.status, 400);
  assert.equal(fx.calls.length, 0);
});

test('missing serverId → 400', async () => {
  fx = installFetch();
  const r = await callRoute(owner, '/api/owner/challenge', {
    method: 'POST', params: { action: 'challenge' }, body: { apiKey: KEY },
  });
  assert.equal(r.status, 400);
  assert.match(String(obj(r).error), /serverId/);
  assert.equal(fx.calls.length, 0);
});

test('serverId with a `..` segment → 400 (path-traversal guard, no upstream call)', async () => {
  fx = installFetch();
  const r = await callRoute(owner, '/api/owner/tools', {
    method: 'POST', params: { action: 'tools' }, body: { apiKey: KEY, serverId: 'io.github.you/../admin' },
  });
  assert.equal(r.status, 400);
  assert.equal(fx.calls.length, 0);
});

test('mocked upstream 401 passes through as 401 + {error}', async () => {
  fx = installFetch(new Response(JSON.stringify({ error: 'unauthorized api_key' }), { status: 401 }));
  const r = await callRoute(owner, '/api/owner/challenge', {
    method: 'POST', params: { action: 'challenge' }, body: { apiKey: KEY, serverId: SERVER },
  });
  assert.equal(r.status, 401);
  assert.equal(obj(r).error, 'unauthorized api_key');
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

test('mocked upstream 200 passes through with body + status', async () => {
  fx = installFetch(new Response(JSON.stringify({ challenge: 'txt-record-abc', status: 'pending' }), { status: 200 }));
  const r = await callRoute(owner, '/api/owner/challenge', {
    method: 'POST', params: { action: 'challenge' }, body: { apiKey: KEY, serverId: SERVER },
  });
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.challenge, 'txt-record-abc');
  assert.equal(b.status, 'pending');
});

test('apiKey goes to the Authorization header only — never the URL, never a log', async () => {
  const cc = captureConsole();
  fx = installFetch(new Response('{}', { status: 200 }));
  try {
    await callRoute(owner, '/api/owner/verify-ownership', {
      method: 'POST', params: { action: 'verify-ownership' }, body: { apiKey: KEY, serverId: SERVER },
    });
  } finally {
    cc.restore();
  }
  const call = fx.calls[0];
  assert.ok(call, 'upstream was called');
  assert.ok(!call.url.includes(KEY), 'apiKey must never appear in the upstream URL');
  const auth = (call.init.headers as Record<string, string>).Authorization;
  assert.equal(auth, `Bearer ${KEY}`, 'apiKey must ride the Authorization header');
  // The body forwarded upstream carries server_id but NOT the apiKey.
  assert.ok(!String(call.init.body).includes(KEY), 'apiKey must not be forwarded in the upstream body');
  // Nothing logged should contain the key.
  assert.ok(!cc.logs.some((l) => l.includes(KEY)), 'apiKey must never be logged');
});

test('tools action → GET with slash-preserving encoded path, no body', async () => {
  fx = installFetch(new Response(JSON.stringify({ tools: [] }), { status: 200 }));
  await callRoute(owner, '/api/owner/tools', {
    method: 'POST', params: { action: 'tools' }, body: { apiKey: KEY, serverId: SERVER },
  });
  const call = fx.calls[0];
  assert.equal(call.init.method, 'GET');
  assert.ok(call.url.endsWith('/owner/tools/io.github.you/srv'), `unexpected path: ${call.url}`);
  assert.equal(call.init.body, undefined, 'GET action must not send a body');
});

test('verify-behavior forwards optional credential + risk_acknowledged', async () => {
  fx = installFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  await callRoute(owner, '/api/owner/verify-behavior', {
    method: 'POST', params: { action: 'verify-behavior' },
    body: { apiKey: KEY, serverId: SERVER, credential: 'tok_123', risk_acknowledged: true },
  });
  const sent = JSON.parse(String(fx.calls[0].init.body));
  assert.equal(sent.server_id, SERVER);
  assert.equal(sent.credential, 'tok_123');
  assert.equal(sent.risk_acknowledged, true);
});

test('network error → generic 502, no upstream body leak', async () => {
  fx = installFetch(undefined, new TypeError('fetch failed'));
  const r = await callRoute(owner, '/api/owner/result', {
    method: 'POST', params: { action: 'result' }, body: { apiKey: KEY, serverId: SERVER },
  });
  assert.equal(r.status, 502);
  assert.equal(obj(r).error, 'upstream unavailable');
});

test('upstream timeout → 504 generic', async () => {
  const to = new Error('timed out'); to.name = 'TimeoutError';
  fx = installFetch(undefined, to);
  const r = await callRoute(owner, '/api/owner/verify-behavior', {
    method: 'POST', params: { action: 'verify-behavior' }, body: { apiKey: KEY, serverId: SERVER },
  });
  assert.equal(r.status, 504);
  assert.equal(obj(r).error, 'upstream unavailable');
});

test('upstream 5xx → generic 502, never echoes the upstream 5xx body', async () => {
  fx = installFetch(new Response('Internal Server Error: stack trace at owner-svc:0xdeadbeef', { status: 500 }));
  const r = await callRoute(owner, '/api/owner/publish', {
    method: 'POST', params: { action: 'publish' }, body: { apiKey: KEY, serverId: SERVER },
  });
  assert.equal(r.status, 502);
  assert.equal(obj(r).error, 'upstream unavailable');
  assert.ok(!r.text.includes('deadbeef'), 'must not leak the upstream 5xx body');
});

test('publish sends consent_publish:true', async () => {
  fx = installFetch(new Response(JSON.stringify({ queued: true }), { status: 202 }));
  const r = await callRoute(owner, '/api/owner/publish', {
    method: 'POST', params: { action: 'publish' }, body: { apiKey: KEY, serverId: SERVER },
  });
  assert.equal(r.status, 202);
  const sent = JSON.parse(String(fx.calls[0].init.body));
  assert.equal(sent.consent_publish, true);
  assert.equal(sent.server_id, SERVER);
});
