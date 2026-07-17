export type BodyCache = { version: string; body: string };

// Process-lifetime, version-keyed body cache with concurrent-build de-duplication, extracted from
// the /llms-full.txt route so both the turnover logic AND the concurrency coordination are unit-
// testable (the route file then exports only its HTTP handler + config). One instance per process.
export function createVersionedBodyCache() {
  let cache: BodyCache | null = null;
  let inflight: Promise<BodyCache> | null = null;

  return {
    // Return the cached body for `version`, building it via `build()` on a miss. Two concurrent
    // misses share ONE build (no double ~4MB serialize). On a build throw the promise rejects to
    // all waiters and `inflight` is cleared so the next call retries cleanly (no permanent poison).
    async resolve(version: string, build: () => Promise<string>): Promise<BodyCache> {
      if (cache && cache.version === version) return cache;
      if (inflight) return inflight;
      inflight = (async () => {
        const body = await build();
        cache = { version, body };
        return cache;
      })();
      try {
        return await inflight;
      } finally {
        inflight = null;
      }
    },
  };
}
