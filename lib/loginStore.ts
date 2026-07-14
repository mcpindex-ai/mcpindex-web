// Upstash-backed StateStore for the self-serve login OAuth state (one-time, TTL'd). Mirrors the
// driftOAuth Redis pattern. Returns null when Redis is unconfigured (caller -> unavailable).

import { Redis } from '@upstash/redis';
import type { StateStore } from './loginOAuth';

let _redis: Redis | null | undefined;

/** @internal test seam. */
export function __setLoginStoreRedisForTest(client: Redis | null | undefined): void {
  _redis = client;
}

function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  _redis = url && token ? new Redis({ url, token, retry: { retries: 1 } }) : null;
  return _redis;
}

export function loginStore(): StateStore | null {
  const r = redis();
  if (!r) return null;
  return {
    async set(key: string, value: string, ttlSec: number): Promise<boolean> {
      // nx: never clobber a live state; ex: auto-expire so abandoned logins self-clean.
      const ok = await r.set(key, value, { nx: true, ex: ttlSec });
      return ok !== null;
    },
    async getdel(key: string): Promise<string | null> {
      // @upstash/redis defaults to automaticDeserialization: a value we stored as a JSON STRING
      // (the encoded {cb,provider} state) is JSON.parse'd back into an OBJECT on read. Re-stringify
      // any non-string so this honors the StateStore contract (always a string) and decodeState can
      // parse it. A legacy bare-callback string passes through unchanged.
      const v = await r.getdel(key);
      if (v === null || v === undefined) return null;
      return typeof v === 'string' ? v : JSON.stringify(v);
    },
  };
}
