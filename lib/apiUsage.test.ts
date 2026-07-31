import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyUsageUa,
  recordApiCall,
  usageRouteFor,
  __setUsageRedisForTest,
} from './apiUsage';

afterEach(() => {
  // null, NOT undefined: undefined means "recompute from env", so on a runner that injects
  // UPSTASH_REDIS_REST_* a later test would write to LIVE Redis. null means "no client".
  __setUsageRedisForTest(null);
  delete process.env.API_USAGE_COUNT_DISABLED;
});

function mockPipe() {
  const cmds: unknown[][] = [];
  let pipelineCalls = 0;
  const pipe = {
    incr(k: string) { cmds.push(['incr', k]); return pipe; },
    expire(k: string, t: number) { cmds.push(['expire', k, t]); return pipe; },
    exec() { return Promise.resolve(cmds.map(() => 1)); },
  };
  return {
    client: { pipeline: () => { pipelineCalls++; return pipe; } },
    cmds: () => cmds,
    calls: () => pipelineCalls,
  };
}

test('usageRouteFor: matches the three counted surfaces exactly', () => {
  assert.equal(usageRouteFor('/api/mcp'), 'mcp');
  assert.equal(usageRouteFor('/api/v1/preflight'), 'preflight');
  assert.equal(usageRouteFor('/ledger'), 'ledger');
});

test('usageRouteFor: does not match anything else', () => {
  for (const p of [
    '/',
    '/api/v1/search',
    '/api/v1/ledger', // the JSON API, not the page — counted as neither
    '/ledger/',
    '/ledgers',
    '/server/foo',
    '/api/mcp/extra',
  ]) {
    assert.equal(usageRouteFor(p), null, `expected no match for ${p}`);
  }
});

test('usageRouteFor: Next 16 segment-prefetch paths do NOT count as a ledger view', () => {
  // The load-bearing reason exact matching is used. Next 16 prefetches through segment routes
  // (observed live: /docs.segments/_tree.segment), and the obvious `next-router-prefetch` header
  // check is unavailable — Next strips Flight headers inside Proxy. Exact matching is the only
  // thing keeping a hover out of the page-view count. If this test ever fails, prefetch traffic
  // is being reported as human page views in a document that goes to a government adjudicator.
  for (const p of [
    '/ledger.segments/_tree.segment',
    '/ledger.segments/_head.segment',
    '/ledger.segments/ledger/__PAGE__.segment',
  ]) {
    assert.equal(usageRouteFor(p), null, `segment path must not count: ${p}`);
  }
});

test('classifyUsageUa: real browsers are nonbot', () => {
  for (const ua of [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
  ]) {
    assert.equal(classifyUsageUa(ua), 'nonbot', ua);
  }
});

test('classifyUsageUa: AI crawlers are bot (delegates to classifyAeoBot)', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
    'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
    'Mozilla/5.0 (compatible; PerplexityBot/1.0)',
  ]) {
    assert.equal(classifyUsageUa(ua), 'bot', ua);
  }
});

test('classifyUsageUa: search crawlers and scripts are bot', () => {
  // aeoCounter deliberately ignores these (its question is "which LLM vendors fetch us").
  // This counter must not, or Googlebot lands in the number offered as human traffic.
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0)',
    'Mozilla/5.0 (compatible; YandexBot/3.0)',
    'curl/8.7.1',
    'Wget/1.21.4',
    'python-requests/2.32.3',
    'axios/1.7.2',
    'node-fetch/1.0',
    'Go-http-client/2.0',
    'Better Uptime Bot',
  ]) {
    assert.equal(classifyUsageUa(ua), 'bot', ua);
  }
});

test('classifyUsageUa: a missing or blank UA is bot, not human', () => {
  // No real browser omits User-Agent. Filing a headless script as human is the error that
  // corrupts the metric; filing an anonymised human as a bot merely understates it.
  assert.equal(classifyUsageUa(null), 'bot');
  assert.equal(classifyUsageUa(undefined), 'bot');
  assert.equal(classifyUsageUa(''), 'bot');
  assert.equal(classifyUsageUa('   '), 'bot');
});

test('recordApiCall: writes one day-bucketed key with a TTL, in a single pipeline', () => {
  const m = mockPipe();
  __setUsageRedisForTest(m.client as never);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  return recordApiCall('mcp', 'curl/8.7.1').then(() => {
    assert.equal(m.calls(), 1, 'exactly one pipeline round trip');
    assert.deepEqual(m.cmds(), [
      ['incr', `usage:mcp:bot:${day}`],
      // incr and expire must ship together — a failure landing between them would leave a key
      // with no TTL, which then never expires.
      ['expire', `usage:mcp:bot:${day}`, 400 * 24 * 60 * 60],
    ]);
  });
});

test('recordApiCall: nonbot and bot land in different keys', () => {
  const m = mockPipe();
  __setUsageRedisForTest(m.client as never);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const browser = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

  return recordApiCall('ledger', browser)
    .then(() => recordApiCall('ledger', 'Googlebot/2.1'))
    .then(() => {
      assert.deepEqual(
        m.cmds().filter((c) => c[0] === 'incr').map((c) => c[1]),
        [`usage:ledger:nonbot:${day}`, `usage:ledger:bot:${day}`],
      );
    });
});

test('recordApiCall: repeat calls are NOT deduped — this counts volume, not presence', () => {
  // The single most important behavioural difference from lib/aeoCounter.ts, which dedups per
  // (route, family, isolate-minute). A dedup here would silently under-report the exact number
  // being reported as evidence.
  const m = mockPipe();
  __setUsageRedisForTest(m.client as never);

  return recordApiCall('preflight', 'curl/8.7.1')
    .then(() => recordApiCall('preflight', 'curl/8.7.1'))
    .then(() => recordApiCall('preflight', 'curl/8.7.1'))
    .then(() => {
      assert.equal(m.calls(), 3, 'three calls must produce three increments');
    });
});

test('recordApiCall: no-ops when the kill switch is set', () => {
  const m = mockPipe();
  __setUsageRedisForTest(m.client as never);
  process.env.API_USAGE_COUNT_DISABLED = '1';

  return recordApiCall('mcp', 'curl/8.7.1').then(() => {
    assert.equal(m.calls(), 0);
  });
});

test('recordApiCall: resolves without throwing when Redis is unconfigured', () => {
  __setUsageRedisForTest(null);
  return recordApiCall('mcp', 'curl/8.7.1'); // must not reject
});

test('recordApiCall: swallows a Redis failure (fail-open)', () => {
  // Counting must never break a response. A throwing client must not surface.
  const exploding = {
    pipeline: () => ({
      incr() { return this; },
      expire() { return this; },
      exec() { return Promise.reject(new Error('upstash down')); },
    }),
  };
  __setUsageRedisForTest(exploding as never);
  return recordApiCall('ledger', 'curl/8.7.1'); // must resolve, not reject
});
