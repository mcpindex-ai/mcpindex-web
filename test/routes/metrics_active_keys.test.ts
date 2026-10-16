// The factory reads the active-key count here with its own bearer token; nobody else gets in,
// and a store that cannot be read answers 503 rather than a count of zero.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { callRoute } from './_harness';
import { GET } from '../../app/api/metrics/active-keys/route';
import { __setActiveKeysRedisForTest, bucketKey, keyId, type ActiveKeysRedis } from '../../lib/activeKeys';
import { createHash } from 'node:crypto';
import { READER_TOKEN_SHA256, __setReaderHashForTest } from '../../lib/metricsReader';

const FACTORY = createHash('sha256').update('factory', 'utf8').digest('hex');

afterEach(() => { __setActiveKeysRedisForTest(null); __setReaderHashForTest(undefined); });

function fake(sets: Record<string, string[]>, fail = false): ActiveKeysRedis {
  return {
    pipeline() {
      const keys: string[] = [];
      const p = {
        sadd: () => p, expire: () => p,
        smembers(k: string) { keys.push(k); return p; },
        exec: () => (fail ? Promise.reject(new Error('down')) : Promise.resolve(keys.map((k) => sets[k] ?? []))),
      };
      return p;
    },
  };
}

test('metrics/active-keys: no token, a wrong token or the hash itself all get the same 401', async () => {
  __setActiveKeysRedisForTest(fake({}));
  for (const h of [undefined, 'Bearer nope', `Bearer ${READER_TOKEN_SHA256}`]) {
    const r = await callRoute(GET, '/api/metrics/active-keys', { headers: h ? { authorization: h } : {} });
    assert.equal(r.status, 401);
    assert.deepEqual(r.json(), { error: 'unauthorized' });
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
});

test('metrics/active-keys: the factory token reads a series of counts, never a key id', async () => {
  __setReaderHashForTest(FACTORY);
  const a = keyId('mcpk_A'), b = keyId('mcpk_B');
  __setActiveKeysRedisForTest(fake({
    [bucketKey('20261015')]: [a, b], [bucketKey('20261016')]: [a],
  }));
  const r = await callRoute(GET, '/api/metrics/active-keys',
    { headers: { authorization: 'Bearer factory' }, query: { end: '2026-10-16', days: '2' } });
  assert.equal(r.status, 200);
  const series = (r.json() as { series: { date: string; active_keys: number; days_with_data: number }[] }).series;
  assert.deepEqual(series.map((s) => [s.date, s.active_keys, s.days_with_data]),
    [['2026-10-15', 0, 1], ['2026-10-16', 1, 2]]);
  assert.ok(!r.text.includes(a) && !r.text.includes(b));
});

test('metrics/active-keys: bad parameters are 400 and a failed read is 503', async () => {
  __setReaderHashForTest(FACTORY);
  const auth = { authorization: 'Bearer factory' };
  __setActiveKeysRedisForTest(fake({}));
  const bad: Record<string, string>[] = [{ days: '0' }, { days: '31' }, { days: 'x' }, { end: '2026-13-01' }, { end: 'today' }];
  for (const query of bad) {
    const r = await callRoute(GET, '/api/metrics/active-keys', { query, headers: auth });
    assert.equal(r.status, 400, JSON.stringify(query));
  }
  __setActiveKeysRedisForTest(fake({}, true));
  const down = await callRoute(GET, '/api/metrics/active-keys', { query: { end: '2026-10-16' }, headers: auth });
  assert.equal(down.status, 503);
  __setActiveKeysRedisForTest(null);
  assert.equal((await callRoute(GET, '/api/metrics/active-keys', { headers: auth })).status, 503);
});
