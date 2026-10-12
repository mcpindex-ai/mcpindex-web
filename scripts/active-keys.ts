#!/usr/bin/env npx tsx
/**
 * Print the active-API-key count (the north-star metric) for one UTC date.
 *
 *   npm run metrics:active-keys -- --date 2026-10-31
 *   npm run metrics:active-keys            (defaults to today, UTC)
 *
 * Output is one JSON object on stdout (see ActiveKeysReport in lib/activeKeys.ts). The window
 * and the 2-of-7 rule are defined there and nowhere else; tools/niw-metrics shells out to this
 * script so it never carries its own copy.
 *
 * Reads Upstash with the read-write REST creds from the environment (UPSTASH_REDIS_REST_* or
 * KV_REST_API_*). Issues one pipelined round trip of 7 SMEMBERS. Prints counts only, never a
 * key id. Exit 1 with a message on stderr when the read fails, so a caller can never mistake a
 * failed read for zero active keys.
 */

import { activeKeysOn } from '../lib/activeKeys';

function argDate(argv: string[]): string {
  const i = argv.indexOf('--date');
  if (i >= 0 && argv[i + 1]) return argv[i + 1]!;
  return new Date().toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const report = await activeKeysOn(argDate(process.argv.slice(2)));
  process.stdout.write(JSON.stringify(report) + '\n');
}

main().catch((e: unknown) => {
  process.stderr.write(`active-keys: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
