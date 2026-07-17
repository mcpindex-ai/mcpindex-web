import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAeoBot, recordAeoFetch, __setAeoRedisForTest, __resetAeoDedupForTest } from './aeoCounter';

afterEach(() => {
  __setAeoRedisForTest(undefined);
  __resetAeoDedupForTest(); // per-minute dedup would otherwise make same-family repeat calls no-op
});

// Mock the subset of the Upstash client recordAeoFetch uses: a chainable pipeline().
function mockPipe(opts: { onExec?: (cmds: unknown[][]) => void; hang?: boolean } = {}) {
  const cmds: unknown[][] = [];
  let pipelineCalls = 0;
  const pipe = {
    incr(k: string) { cmds.push(['incr', k]); return pipe; },
    expire(k: string, t: number) { cmds.push(['expire', k, t]); return pipe; },
    exec() {
      if (opts.hang) return new Promise(() => {}); // never resolves
      opts.onExec?.(cmds);
      return Promise.resolve(cmds.map(() => 1));
    },
  };
  return { client: { pipeline: () => { pipelineCalls++; return pipe; } }, calls: () => pipelineCalls };
}

test('classifyAeoBot: known AI crawlers map to their family', () => {
  const cases: Array<[string, string]> = [
    ['Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)', 'openai'],
    ['ChatGPT-User/1.0', 'openai'],
    ['OAI-SearchBot/1.0', 'openai'],
    ['Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)', 'anthropic'],
    ['Claude-User/1.0', 'anthropic'],
    ['Claude-SearchBot/1.0', 'anthropic'],
    ['anthropic-ai', 'anthropic'],
    ['Mozilla/5.0 (compatible; PerplexityBot/1.0)', 'perplexity'],
    ['Perplexity-User/1.0', 'perplexity'],
    ['Bytespider', 'bytedance'],
    ['Amazonbot/0.1', 'amazon'],
    ['meta-externalagent/1.1', 'meta'],
    ['cohere-ai/1.0', 'cohere'],
    ['CCBot/2.0 (https://commoncrawl.org/faq/)', 'commoncrawl'],
  ];
  for (const [ua, family] of cases) {
    assert.equal(classifyAeoBot(ua), family, `expected ${ua} -> ${family}`);
  }
});

test('classifyAeoBot: robots.txt-only tokens and search/human UAs are NOT counted', () => {
  for (const ua of [
    // These are robots.txt product tokens, not UA strings — must not be patterns (would read 0):
    'Mozilla/5.0 (compatible; Google-Extended)',
    'Mozilla/5.0 (compatible; Applebot-Extended)',
    // Real search crawlers (Gemini/Apple AI ride these) are out of scope by design:
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; Applebot/0.1)',
    // Humans / tooling:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    'curl/8.4.0',
    '',
    null,
    undefined,
  ]) {
    assert.equal(classifyAeoBot(ua), null, `expected non-bot for: ${String(ua)}`);
  }
});

test('recordAeoFetch: bot fetch pipelines incr+expire on a family/route/day key', async () => {
  let captured: unknown[][] = [];
  const m = mockPipe({ onExec: (c) => { captured = c; } });
  __setAeoRedisForTest(m.client as never);

  await recordAeoFetch('llms-full', 'Mozilla/5.0 (compatible; ClaudeBot/1.0)');

  assert.equal(m.calls(), 1, 'pipeline() should be called exactly once');
  // Both ops ship in ONE pipeline (atomic per request; no key left without a TTL).
  assert.deepEqual(captured[0], ['incr', captured[0][1]]);
  assert.match(String(captured[0][1]), /^aeo:llms-full:anthropic:\d{8}$/);
  assert.equal(captured[1][0], 'expire');
  assert.equal(captured[1][1], captured[0][1]); // expire targets the same key
});

test('recordAeoFetch: non-bot traffic touches Redis not at all', async () => {
  const m = mockPipe();
  __setAeoRedisForTest(m.client as never);
  await recordAeoFetch('llms', 'Mozilla/5.0 (Macintosh) Chrome/120 Safari/537.36');
  assert.equal(m.calls(), 0);
});

test('recordAeoFetch: fail-open when Redis is unconfigured or throws', async () => {
  __setAeoRedisForTest(null);
  await recordAeoFetch('llms', 'GPTBot/1.2');

  __setAeoRedisForTest({ pipeline: () => { throw new Error('redis down'); } } as never);
  await assert.doesNotReject(recordAeoFetch('llms', 'GPTBot/1.2'));
});

test('recordAeoFetch: same route/family within a minute is deduped (write happens once)', async () => {
  const m = mockPipe();
  __setAeoRedisForTest(m.client as never);
  await recordAeoFetch('llms', 'GPTBot/1.2');
  await recordAeoFetch('llms', 'GPTBot/1.2'); // same route+family+minute → suppressed
  assert.equal(m.calls(), 1, 'second same-minute fetch must be deduped');
  // A different family the same minute is NOT deduped (distinct key).
  await recordAeoFetch('llms', 'ClaudeBot/1.0');
  assert.equal(m.calls(), 2);
  // A different ROUTE, same family+minute, is NOT deduped either (route is part of the key).
  await recordAeoFetch('llms-full', 'GPTBot/1.2');
  assert.equal(m.calls(), 3);
  // After reset, a previously-deduped key writes again.
  __resetAeoDedupForTest();
  await recordAeoFetch('llms', 'GPTBot/1.2');
  assert.equal(m.calls(), 4);
});

test('recordAeoFetch: a HUNG Redis returns within the write budget', { timeout: 2000 }, async () => {
  // exec() never resolves — simulates a slow/hung Upstash. Without the Promise.race this hangs
  // forever (and, with the per-test timeout, fails deterministically instead of stalling CI).
  __setAeoRedisForTest(mockPipe({ hang: true }).client as never);
  const start = Date.now();
  await recordAeoFetch('llms-full', 'ClaudeBot/1.0');
  const elapsed = Date.now() - start;
  // WRITE_BUDGET_MS is 300; allow scheduling slack but stay well under a full stall.
  assert.ok(elapsed < 500, `recordAeoFetch waited ${elapsed}ms on a hung Redis (budget 300ms)`);
});
