/**
 * Env-normalization tests.
 *
 * Pins the EXACT footgun that made this module necessary: Vercel provisions env vars as
 * EMPTY strings, `??` does not fall through on '', so the bare chain
 *   process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
 * resolved to '' and every Upstash consumer silently degraded (limiters -> ok:true,
 * ingest -> 204-and-discard). Fixed once in the challenge route, never propagated to the
 * other twelve. These tests exist so the empty-string case can never regress unnoticed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { env, redisUrl, redisToken, redisConfigured } from './env';

const KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'KV_REST_API_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'KV_REST_API_TOKEN',
] as const;

/** Run `fn` with exactly the given env keys set; restores the previous values after. */
function withEnv(vals: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const k of KEYS) {
    saved.set(k, process.env[k]);
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(vals)) process.env[k] = v;
  try {
    fn();
  } finally {
    for (const k of KEYS) {
      const prev = saved.get(k);
      if (prev === undefined) delete process.env[k];
      else process.env[k] = prev;
    }
  }
}

test('env(): undefined, empty, and whitespace-only all normalize to undefined', () => {
  assert.equal(env(undefined), undefined);
  assert.equal(env(''), undefined);
  assert.equal(env('   '), undefined);
  assert.equal(env('\t\n '), undefined);
});

test('env(): a real value survives and is trimmed', () => {
  assert.equal(env('https://x.upstash.io'), 'https://x.upstash.io');
  assert.equal(env('  https://x.upstash.io  '), 'https://x.upstash.io');
});

test('THE BUG: an EMPTY UPSTASH_* falls through to KV_REST_API_*', () => {
  withEnv({ UPSTASH_REDIS_REST_URL: '', KV_REST_API_URL: 'https://kv.example' }, () => {
    assert.equal(redisUrl(), 'https://kv.example');
  });
  withEnv({ UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_TOKEN: 'tok-kv' }, () => {
    assert.equal(redisToken(), 'tok-kv');
  });
});

test('THE BUG, whitespace variant: a blank-but-present var is treated as absent', () => {
  withEnv({ UPSTASH_REDIS_REST_URL: '   ', KV_REST_API_URL: 'https://kv.example' }, () => {
    assert.equal(redisUrl(), 'https://kv.example');
  });
});

test('UPSTASH_* still wins when it holds a real value', () => {
  withEnv(
    { UPSTASH_REDIS_REST_URL: 'https://up.example', KV_REST_API_URL: 'https://kv.example' },
    () => assert.equal(redisUrl(), 'https://up.example'),
  );
});

test('both names absent -> undefined (never an empty string)', () => {
  withEnv({}, () => {
    assert.equal(redisUrl(), undefined);
    assert.equal(redisToken(), undefined);
  });
});

test('redisConfigured(): false when either half is empty, true only when both resolve', () => {
  withEnv({ UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: 'tok' }, () =>
    assert.equal(redisConfigured(), false),
  );
  withEnv({ UPSTASH_REDIS_REST_URL: 'https://up.example', UPSTASH_REDIS_REST_TOKEN: '' }, () =>
    assert.equal(redisConfigured(), false),
  );
  withEnv({ UPSTASH_REDIS_REST_URL: 'https://up.example', UPSTASH_REDIS_REST_TOKEN: 'tok' }, () =>
    assert.equal(redisConfigured(), true),
  );
});

test('redisConfigured(): the empty-UPSTASH + populated-KV case resolves TRUE', () => {
  // Pre-fix this was the silent-total-failure shape: kvConfigured() false, client null,
  // every consumer degraded, nothing logged.
  withEnv(
    { UPSTASH_REDIS_REST_URL: '', KV_REST_API_URL: 'https://kv.example',
      UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_TOKEN: 'tok-kv' },
    () => assert.equal(redisConfigured(), true),
  );
});
