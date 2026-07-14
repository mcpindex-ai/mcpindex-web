import { strict as assert } from 'node:assert';
import test, { afterEach } from 'node:test';
import { Redis } from '@upstash/redis';
import { __setLoginStoreRedisForTest, loginStore } from './loginStore';

afterEach(() => __setLoginStoreRedisForTest(undefined));

// Fake Redis that models what @upstash/redis actually returns from getdel: with automatic
// deserialization ON (the default), a value STORED as a JSON string is JSON.parse'd back into an
// OBJECT on read. This is exactly the shape that caused the login `invalid_state` regression.
function fakeRedis(getdelReturns: unknown): Redis {
  return {
    async set() {
      return 'OK';
    },
    async getdel() {
      return getdelReturns;
    },
  } as unknown as Redis;
}

test('getdel re-stringifies an auto-deserialized object (regression: JSON state -> object)', async () => {
  __setLoginStoreRedisForTest(fakeRedis({ cb: 'http://127.0.0.1:5000/nonce', provider: 'google' }));
  const raw = await loginStore()!.getdel('login:state:x');
  assert.equal(typeof raw, 'string', 'must hand decodeState a string, never an object');
  assert.deepEqual(JSON.parse(raw!), { cb: 'http://127.0.0.1:5000/nonce', provider: 'google' });
});

test('getdel passes a plain string through (legacy bare callback + normal JSON string)', async () => {
  __setLoginStoreRedisForTest(fakeRedis('http://127.0.0.1:5000/nonce'));
  assert.equal(await loginStore()!.getdel('k'), 'http://127.0.0.1:5000/nonce');
});

test('getdel returns null for a missing/consumed state', async () => {
  __setLoginStoreRedisForTest(fakeRedis(null));
  assert.equal(await loginStore()!.getdel('k'), null);
});

test('loginStore is null when Redis is unconfigured', () => {
  __setLoginStoreRedisForTest(null);
  assert.equal(loginStore(), null);
});
