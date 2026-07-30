import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { classifyAeoBot, recordAeoFetch, __setAeoRedisForTest, __resetAeoDedupForTest } from './aeoCounter';

afterEach(() => {
  // null, NOT undefined: undefined means "recompute from env", so on a runner that injects
  // UPSTASH_REDIS_REST_* a later test would write to LIVE Redis. null means "no client".
  __setAeoRedisForTest(null);
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

test('recordAeoFetch: does NOT resolve until the write settles', { timeout: 2000 }, async () => {
  // The inverse of what this module used to guarantee, and deliberately so. The old call site was
  // a route handler using bare fire-and-forget, so this function raced the write against a 300ms
  // budget to keep a hung Upstash off the response path - at the cost of silently abandoning
  // writes. The call site is now proxy.ts under event.waitUntil, which keeps the isolate alive
  // until this promise settles. So resolving EARLY is now the bug: it would tell the platform the
  // work is done while the write is still in flight, which is exactly how writes get dropped.
  // The response-latency guarantee did not disappear, it moved to the call site: see
  // "proxy: the write is deferred to waitUntil, not awaited inline" in test/routes/proxy.test.ts.
  // The bound on how long a hung write may run is now WRITE_TIMEOUT_MS on the Upstash client.
  let settled = false;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  __setAeoRedisForTest({
    pipeline: () => {
      const pipe = { incr: () => pipe, expire: () => pipe, exec: () => gate };
      return pipe;
    },
  } as never);

  const p = recordAeoFetch('llms-full', 'ClaudeBot/1.0').then(() => { settled = true; });
  // Yield generously; nothing should have resolved while the write is outstanding.
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(settled, false, 'resolved before the write settled — waitUntil would drop the write');

  release();
  await p;
  assert.equal(settled, true, 'must resolve once the write completes');
});

test('recordAeoFetch: AEO_COUNT_DISABLED=1 stops counting; default is ON', async () => {
  // Counting is instrumentation, so it defaults ON - a missing env var must never silently stop
  // measurement. The switch exists so an operator can kill a runaway without waiting on a deploy,
  // which is the gap that made the last incident expensive.
  const prev = process.env.AEO_COUNT_DISABLED;
  const cap = mockPipe();
  __setAeoRedisForTest(cap.client as never);
  try {
    process.env.AEO_COUNT_DISABLED = '1';
    await recordAeoFetch('llms', 'GPTBot/1.2');
    assert.equal(cap.calls(), 0, 'kill switch did not stop the write');

    __resetAeoDedupForTest();
    delete process.env.AEO_COUNT_DISABLED;
    await recordAeoFetch('llms', 'GPTBot/1.2');
    assert.ok(cap.calls() > 0, 'counting must be ON when the var is unset');
  } finally {
    if (prev === undefined) delete process.env.AEO_COUNT_DISABLED;
    else process.env.AEO_COUNT_DISABLED = prev;
    __setAeoRedisForTest(null);
  }
});
