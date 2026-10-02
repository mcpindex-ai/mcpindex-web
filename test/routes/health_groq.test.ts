// The Groq health probe must go red when the screen model is gone, and stay
// green when that one chat call is merely rate-limited. Keys are fake; fetch
// is the test seam.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import {
  GET as healthGroq,
  __resetGroqHealthForTest,
  __setGroqHealthFetchForTest,
  __setGroqHealthModelForTest,
  screenProbeOk,
} from '../../app/api/health/groq/route';

beforeEach(() => {
  __resetGroqHealthForTest();
  __setGroqHealthFetchForTest(undefined);
  __setGroqHealthModelForTest(undefined);
  delete process.env.MCPINDEX_GROQ_API_KEY;
  delete process.env.MCPINDEX_GROQ_API_KEY_FALLBACK;
});
afterEach(() => {
  __resetGroqHealthForTest();
  __setGroqHealthFetchForTest(undefined);
  __setGroqHealthModelForTest(undefined);
  delete process.env.MCPINDEX_GROQ_API_KEY;
  delete process.env.MCPINDEX_GROQ_API_KEY_FALLBACK;
});

const obj = (r: { json: () => unknown }) => r.json() as Record<string, any>;

type Seen = { model?: string; maxTokens?: number; chats: number };

function groqFetch(chatStatus: number, seen: Seen) {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return new Response('{"data":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    seen.chats += 1;
    const body = JSON.parse(String(init?.body ?? '{}')) as { model?: string; max_tokens?: number };
    seen.model = body.model;
    seen.maxTokens = body.max_tokens;
    return new Response('{}', { status: chatStatus, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}

test('screenProbeOk: 404 is down, 429 and 503 are unknown', () => {
  assert.equal(screenProbeOk(200), true);
  assert.equal(screenProbeOk(404), false);
  assert.equal(screenProbeOk(400), false);
  assert.equal(screenProbeOk(401), false);
  assert.equal(screenProbeOk(429), null);
  assert.equal(screenProbeOk(503), null);
});

test('health/groq: chat 200 on the screen model stays green', async () => {
  process.env.MCPINDEX_GROQ_API_KEY = 'live-key';
  const seen: Seen = { chats: 0 };
  __setGroqHealthFetchForTest(groqFetch(200, seen));
  const r = await callRoute(healthGroq, '/api/health/groq');
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.healthy, true);
  assert.equal(b.model.ok, true);
  assert.equal(b.model.id, 'openai/gpt-oss-120b');
  assert.equal(seen.model, 'openai/gpt-oss-120b');
  assert.equal(seen.maxTokens, 128);
  assert.equal(seen.chats, 1);
});

test('health/groq: a model id that does not exist turns the probe red', async () => {
  process.env.MCPINDEX_GROQ_API_KEY = 'live-key';
  process.env.MCPINDEX_GROQ_API_KEY_FALLBACK = 'live-fallback';
  __setGroqHealthModelForTest('does-not-exist');
  const seen: Seen = { chats: 0 };
  __setGroqHealthFetchForTest(groqFetch(404, seen));
  const r = await callRoute(healthGroq, '/api/health/groq');
  assert.equal(r.status, 503);
  const b = obj(r);
  assert.equal(b.healthy, false);
  assert.equal(b.model.id, 'does-not-exist');
  assert.equal(b.model.ok, false);
  assert.equal(b.pool[0].ok, true);
  assert.equal(seen.chats, 1);
  assert.equal(seen.model, 'does-not-exist');
});

test('health/groq: chat 429 does not page', async () => {
  process.env.MCPINDEX_GROQ_API_KEY = 'live-key';
  const seen: Seen = { chats: 0 };
  __setGroqHealthFetchForTest(groqFetch(429, seen));
  const r = await callRoute(healthGroq, '/api/health/groq');
  assert.equal(r.status, 200);
  const b = obj(r);
  assert.equal(b.healthy, true);
  assert.equal(b.model.ok, null);
});
